import React, { useState, useEffect } from 'react';
import liff from '@line/liff';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, update, serverTimestamp, remove, get } from "firebase/database";
import { 
  Trash2, Sparkles, Wallet, Users, CheckCircle2, Settings, Edit2, X, 
  CalendarDays, UserPlus, List, ChevronLeft, ChevronRight,
  Calendar, ChevronDown, ChevronUp, Check, Loader2, LogOut, Home, RefreshCw
} from 'lucide-react';

// ==========================================
// ⚙️ 系統設定
// ==========================================
const LIFF_ID = "2009134573-7SuphV8b"; 
const firebaseConfig = {
  apiKey: "AIzaSyBBiEaI_-oH34YLpB4xmlJljyOtxz-yty4",
  authDomain: "roomie-task.firebaseapp.com",
  databaseURL: "https://roomie-task-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "roomie-task",
  storageBucket: "roomie-task.firebasestorage.app",
  messagingSenderId: "233849609695",
  appId: "1:233849609695:web:0c76a4b9b40070cf22386a"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 工具
const getTodayString = () => new Date().toISOString().split('T')[0];
const generateId = () => Math.random().toString(36).substr(2, 9);

export default function RoomieTaskApp() {
  const [loading, setLoading] = useState(true);
  const [viewState, setViewState] = useState('landing'); 
  const [groupId, setGroupId] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  
  const [users, setUsers] = useState([]);
  const [taskConfigs, setTaskConfigs] = useState([]);
  const [currentCycleTasks, setCurrentCycleTasks] = useState([]);
  const [logs, setLogs] = useState([]);

  const [view, setView] = useState('roster');
  const [rosterViewMode, setRosterViewMode] = useState('list');
  const [isMyTasksOpen, setIsMyTasksOpen] = useState(true);
  const [isTaskListOpen, setIsTaskListOpen] = useState(true);
  const [myGroups, setMyGroups] = useState([]);

  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState(null);
  const [configForm, setConfigForm] = useState({ name: '', price: 30, freq: 7, icon: '🧹', defaultAssigneeId: '' });

  // 初始化 LIFF
  useEffect(() => {
    liff.init({ liffId: LIFF_ID }).then(async () => {
      if (!liff.isLoggedIn()) { liff.login(); return; }
      const profile = await liff.getProfile();
      const user = { id: profile.userId, name: profile.displayName || '未命名', avatar: profile.pictureUrl || '' };
      setCurrentUser(user);
      
      const saved = JSON.parse(localStorage.getItem('roomie_groups') || '[]');
      setMyGroups(saved);

      const params = new URLSearchParams(window.location.search);
      const gId = params.get('g');
      
      if (gId) {
        enterGroup(gId, user);
      } else {
        setLoading(false);
      }
    }).catch(err => {
      console.error("LIFF Init Error", err);
      setLoading(false);
    });
  }, []);

  const enterGroup = async (gId, user) => {
    if (!gId) return;
    setLoading(true);
    setGroupId(gId);

    const groupRef = ref(db, `groups/${gId}`);
    onValue(groupRef, (snap) => {
      const data = snap.val();
      if (data) {
        // --- 核心防崩潰處理 ---
        const rawUsers = data.users ? Object.values(data.users) : [];
        setUsers(rawUsers.filter(u => u && u.id));

        const rawConfigs = data.taskConfigs ? Object.values(data.taskConfigs) : [];
        setTaskConfigs(rawConfigs.filter(c => c && c.id));

        const rawTasks = data.tasks ? Object.values(data.tasks) : [];
        setCurrentCycleTasks(rawTasks.filter(t => t && t.id).sort((a,b) => (a.date || '').localeCompare(b.date || '')));

        const rawLogs = data.logs ? Object.values(data.logs) : [];
        setLogs(rawLogs.filter(l => l && l.id).sort((a,b) => b.id - a.id));

        setGroupName(data.metadata?.name || '我的家');
        
        // 更新本地紀錄
        const saved = JSON.parse(localStorage.getItem('roomie_groups') || '[]');
        if (!saved.find(g => g.id === gId)) {
          const updated = [{ id: gId, name: data.metadata?.name || '新空間' }, ...saved].slice(0, 5);
          localStorage.setItem('roomie_groups', JSON.stringify(updated));
          setMyGroups(updated);
        }

        if (user && (!data.users || !data.users[user.id])) {
          update(ref(db, `groups/${gId}/users/${user.id}`), { ...user, balance: 0 });
        }
        
        setViewState('app');
      } else {
        setViewState('landing');
      }
      setLoading(false);
    });
  };

  const addLog = (msg, type = 'info') => {
    if (!groupId) return;
    const logId = Date.now();
    set(ref(db, `groups/${groupId}/logs/${logId}`), { 
      id: logId, 
      msg, 
      type, 
      time: new Date().toLocaleTimeString() 
    });
  };

  const handleCreateGroup = async () => {
    if (!currentUser) return;
    setLoading(true);
    const gid = `rm-${generateId()}`;
    const newPath = `${window.location.origin}${window.location.pathname}?g=${gid}`;
    
    await set(ref(db, `groups/${gid}`), {
      metadata: { name: `${currentUser.name} 的家`, createdAt: serverTimestamp() },
      users: { [currentUser.id]: { ...currentUser, balance: 0 } },
      logs: { [Date.now()]: { id: Date.now(), msg: "🏠 空間已建立", type: "info", time: new Date().toLocaleTimeString() } }
    });
    
    // 強制導向新網址
    window.location.href = `https://liff.line.me/${LIFF_ID}?g=${gid}`;
  };

  // --- 家事動作 ---
  const completeTask = async (task) => {
    await update(ref(db, `groups/${groupId}/tasks/${task.id}`), { status: 'done' });
    addLog(`✅ ${currentUser.name} 完成了: ${task.name}`, 'success');
  };

  const releaseTask = async (task) => {
    const myBal = users.find(u => u.id === currentUser.id)?.balance || 0;
    const updates = {};
    updates[`groups/${groupId}/tasks/${task.id}/status`] = 'open';
    updates[`groups/${groupId}/tasks/${task.id}/currentHolderId`] = null;
    updates[`groups/${groupId}/users/${currentUser.id}/balance`] = myBal - (task.price || 0);
    await update(ref(db), updates);
    addLog(`💸 ${currentUser.name} 釋出賞金任務: ${task.name} ($${task.price})`, 'warning');
  };

  const claimTask = async (task) => {
    const myBal = users.find(u => u.id === currentUser.id)?.balance || 0;
    const updates = {};
    updates[`groups/${groupId}/tasks/${task.id}/status`] = 'pending';
    updates[`groups/${groupId}/tasks/${task.id}/currentHolderId`] = currentUser.id;
    updates[`groups/${groupId}/users/${currentUser.id}/balance`] = myBal + (task.price || 0);
    await update(ref(db), updates);
    addLog(`💰 ${currentUser.name} 接手了任務: ${task.name}`, 'success');
  };

  const saveConfig = async () => {
    const id = editingConfigId || `cfg-${generateId()}`;
    const freqVal = typeof configForm.freq === 'string' ? configForm.freq : `每 ${configForm.freq} 天`;
    const configData = { ...configForm, id, freq: freqVal, defaultAssigneeId: configForm.defaultAssigneeId || currentUser.id };
    
    await update(ref(db), { [`groups/${groupId}/taskConfigs/${id}`]: configData });
    setIsEditingConfig(false);
    
    if (!editingConfigId && confirm("已儲存規則！是否立即在值日表中產生一項任務？")) {
      const tid = `task-${generateId()}`;
      await set(ref(db, `groups/${groupId}/tasks/${tid}`), {
        id: tid, ...configData, date: getTodayString(), status: 'pending', currentHolderId: configData.defaultAssigneeId
      });
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-gray-50"><Loader2 className="animate-spin text-[#28C8C8]" size={40}/></div>;

  if (viewState === 'landing') return (
    <div className="max-w-md mx-auto h-screen bg-gray-50 flex flex-col p-6">
      <div className="flex-1">
        <h1 className="text-2xl font-bold mb-2">👋 嗨，{currentUser?.name}</h1>
        <p className="text-gray-500 text-sm mb-8">選擇空間或建立一個新的</p>
        
        <div className="space-y-4">
          {myGroups.map(g => (
            <div key={g.id} onClick={() => enterGroup(g.id, currentUser)} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center active:scale-95 transition-transform">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#28C8C8]/10 rounded-full flex items-center justify-center text-[#28C8C8]"><Home size={20}/></div>
                <span className="font-bold text-gray-700">{g.name}</span>
              </div>
              <ChevronRight size={18} className="text-gray-300"/>
            </div>
          ))}
        </div>
      </div>
      <button onClick={handleCreateGroup} className="bg-[#28C8C8] text-white py-4 rounded-2xl font-bold shadow-lg active:scale-95 transition-transform">+ 建立新空間</button>
    </div>
  );

  return (
    <div className="max-w-md mx-auto h-screen bg-gray-50 flex flex-col overflow-hidden">
      <header className="bg-white p-4 border-b flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2" onClick={() => window.location.href = `https://liff.line.me/${LIFF_ID}`}>
          <ChevronLeft size={20}/><h1 className="font-bold truncate max-w-[120px]">{groupName}</h1>
        </div>
        <div className="flex items-center gap-2 bg-gray-100 p-1 pr-3 rounded-full">
          <img src={currentUser?.avatar} className="w-6 h-6 rounded-full border border-white"/>
          <span className="text-[10px] font-bold text-gray-600">{currentUser?.name}</span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-24">
        {view === 'roster' && (
          <div className="space-y-6">
            <div className="flex bg-gray-200 p-1 rounded-xl">
              <button onClick={() => setRosterViewMode('list')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${rosterViewMode === 'list' ? 'bg-white text-[#28C8C8] shadow-sm' : 'text-gray-500'}`}>清單模式</button>
              <button onClick={() => setRosterViewMode('calendar')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${rosterViewMode === 'calendar' ? 'bg-white text-[#28C8C8] shadow-sm' : 'text-gray-500'}`}>日曆模式</button>
            </div>

            {rosterViewMode === 'list' ? (
              <div className="space-y-6 animate-fade-in">
                <section>
                  <div className="flex justify-between items-center mb-3" onClick={() => setIsMyTasksOpen(!isMyTasksOpen)}>
                    <h3 className="font-bold text-gray-700 flex items-center gap-2"><CheckCircle2 size={18} className="text-[#28C8C8]"/> 我的待辦</h3>
                    {isMyTasksOpen ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                  </div>
                  {isMyTasksOpen && (
                    <div className="space-y-3">
                      {currentCycleTasks.filter(t => t.currentHolderId === currentUser?.id && t.status === 'pending').map(task => (
                        <div key={task.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{task.icon}</span>
                            <div><div className="font-bold text-sm text-gray-800">{task.name}</div><div className="text-[10px] text-gray-400 font-mono">{task.date}</div></div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => releaseTask(task)} className="bg-red-50 text-red-500 px-3 py-1.5 rounded-lg text-xs font-bold">沒空</button>
                            <button onClick={() => completeTask(task)} className="bg-[#28C8C8] text-white px-3 py-1.5 rounded-lg text-xs font-bold">完成</button>
                          </div>
                        </div>
                      ))}
                      {currentCycleTasks.filter(t => t.currentHolderId === currentUser?.id && t.status === 'pending').length === 0 && <div className="text-center py-6 text-gray-300 text-xs italic">目前沒有任務 🎉</div>}
                    </div>
                  )}
                </section>

                <section>
                  <div className="flex justify-between items-center mb-3" onClick={() => setIsTaskListOpen(!isTaskListOpen)}>
                    <h3 className="font-bold text-gray-700 flex items-center gap-2"><Users size={18} className="text-gray-400"/> 任務列表</h3>
                    {isTaskListOpen ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                  </div>
                  {isTaskListOpen && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-50">
                      {currentCycleTasks.map(task => {
                        const isOpen = task.status === 'open';
                        const isDone = task.status === 'done';
                        const holder = users.find(u => u.id === task.currentHolderId);
                        return (
                          <div key={task.id} className={`p-4 flex items-center justify-between ${isOpen ? 'bg-red-50/50' : ''}`}>
                            <div className="flex items-center gap-3">
                              <span className={`text-2xl ${isDone ? 'opacity-30 grayscale' : ''}`}>{task.icon}</span>
                              <div>
                                <div className="font-bold text-sm flex items-center gap-2">{task.name} {isOpen && <span className="bg-red-500 text-white text-[8px] px-1 rounded animate-pulse">賞金 ${task.price}</span>}</div>
                                <div className="text-[10px] text-gray-400 font-mono">{task.date} · {isOpen ? '徵求中' : (holder?.name || '未分配')}</div>
                              </div>
                            </div>
                            {isOpen && <button onClick={() => claimTask(task)} className="bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold">接單</button>}
                            {isDone && <CheckCircle2 className="text-green-300" size={20}/>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
              </div>
            ) : (
              <div className="bg-white p-8 rounded-2xl shadow-sm text-center py-20 text-gray-400 border border-dashed">日曆視圖開發中</div>
            )}
          </div>
        )}

        {view === 'wallet' && (
          <div className="space-y-4 animate-fade-in">
            <div className="bg-[#28C8C8] p-8 rounded-3xl text-white shadow-xl shadow-[#28C8C8]/20 flex justify-between items-center">
              <div><div className="text-xs opacity-70 mb-1">我的結餘</div><div className="text-4xl font-bold font-mono">${users.find(u => u.id === currentUser?.id)?.balance || 0}</div></div>
              <Wallet size={48} className="opacity-20"/>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 shadow-sm overflow-hidden">
              {users.map(u => (
                <div key={u.id} className="p-4 flex justify-between items-center">
                  <div className="flex items-center gap-3"><img src={u.avatar} className="w-10 h-10 rounded-full border-2 border-gray-50"/><span className="font-bold text-sm text-gray-700">{u.name}</span></div>
                  <span className={`font-mono font-bold text-lg ${u.balance >= 0 ? 'text-[#28C8C8]' : 'text-red-500'}`}>{u.balance >= 0 ? '+' : ''}{u.balance}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'history' && (
          <div className="space-y-4 pl-4 border-l-2 border-gray-100 ml-2 animate-fade-in">
            {logs.map(log => (
              <div key={log.id} className="relative pb-6">
                <div className={`absolute -left-[23px] top-1 w-3 h-3 rounded-full border-2 border-white ${log.type === 'success' ? 'bg-green-500' : log.type === 'warning' ? 'bg-red-500' : 'bg-[#28C8C8]'}`}></div>
                <div className="text-sm text-gray-700 font-medium">{log.msg}</div>
                <div className="text-[10px] text-gray-400 mt-1">{log.time}</div>
              </div>
            ))}
          </div>
        )}

        {view === 'settings' && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-center">
              <div><div className="font-bold text-gray-800">邀請室友</div><div className="text-[10px] text-gray-400">目前空間成員: {users.length} 人</div></div>
              <button onClick={async () => {
                const link = `https://liff.line.me/${LIFF_ID}?g=${groupId}`;
                if (liff.isApiAvailable('shareTargetPicker')) await liff.shareTargetPicker([{ type: "text", text: `🏠 邀請你加入我的家事空間：\n${link}` }]);
                else { navigator.clipboard.writeText(link); alert("連結已複製！"); }
              }} className="bg-[#28C8C8] text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-md active:scale-95 transition-transform">發送連結</button>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
              <div className="flex justify-between items-center"><h3 className="font-bold text-gray-800">家事規則設定</h3><button onClick={() => { setEditingConfigId(null); setConfigForm({ name: '', price: 30, freq: 7, icon: '🧹', defaultAssigneeId: currentUser.id }); setIsEditingConfig(true); }} className="text-[#28C8C8] text-xs font-bold flex items-center gap-1"><Plus size={14}/> 新增</button></div>
              <div className="space-y-2">
                {taskConfigs.map(c => (
                  <div key={c.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl group hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-3"><span className="text-2xl">{c.icon}</span><div><div className="font-bold text-sm text-gray-700">{c.name}</div><div className="text-[10px] text-gray-400 font-medium">${c.price} / {c.freq}</div></div></div>
                    <div className="flex gap-4 text-gray-300">
                      <Edit2 size={18} className="hover:text-[#28C8C8] cursor-pointer transition-colors" onClick={() => { setEditingConfigId(c.id); setConfigForm({ ...c, freq: parseInt(String(c.freq).match(/\d+/)?.[0] || '7') }); setIsEditingConfig(true); }}/>
                      <Trash2 size={18} className="hover:text-red-500 cursor-pointer transition-colors" onClick={() => { if(confirm("確定刪除此規則？")) remove(ref(db, `groups/${groupId}/taskConfigs/${c.id}`)); }}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={() => { if(confirm("確定登出此空間？這將會清除本地緩存。")) { localStorage.clear(); window.location.href=`https://liff.line.me/${LIFF_ID}`; } }} className="w-full py-4 text-red-400 text-xs font-bold border border-red-100 rounded-2xl bg-red-50/30">退出此空間</button>
          </div>
        )}
      </main>

      <nav className="bg-white border-t flex justify-around pb-10 pt-3 shadow-lg">
        {[{id:'roster', icon:CalendarDays, label:'值日表'}, {id:'wallet', icon:Wallet, label:'帳本'}, {id:'history', icon:History, label:'動態'}, {id:'settings', icon:Settings, label:'設定'}].map(n => (
          <button key={n.id} onClick={() => setView(n.id)} className={`flex flex-col items-center w-full py-2 transition-colors ${view === n.id ? 'text-[#28C8C8]' : 'text-gray-300'}`}><n.icon size={24}/><span className="text-[10px] font-bold mt-1">{n.label}</span></button>
        ))}
      </nav>

      {/* Editor Modal */}
      {isEditingConfig && (
        <div className="fixed inset-0 bg-white z-50 flex flex-col animate-slide-up">
          <div className="p-4 border-b flex justify-between items-center bg-gray-50">
            <h2 className="font-bold text-gray-800">{editingConfigId ? '編輯家事規則' : '新增家事規則'}</h2>
            <button onClick={() => setIsEditingConfig(false)} className="p-2 bg-white rounded-full shadow-sm"><X size={20}/></button>
          </div>
          <div className="p-6 space-y-8 flex-1 overflow-y-auto">
            <div className="space-y-2"><label className="text-xs font-bold text-gray-400 uppercase">家事名稱</label><input type="text" placeholder="例如：倒垃圾" value={configForm.name} onChange={e => setConfigForm({...configForm, name:e.target.value})} className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-[#28C8C8] transition-all font-bold"/></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><label className="text-xs font-bold text-gray-400 uppercase">圖示</label><input type="text" placeholder="🧹" value={configForm.icon} onChange={e => setConfigForm({...configForm, icon:e.target.value})} className="w-full p-4 bg-gray-50 border-none rounded-2xl text-center text-2xl"/></div>
              <div className="space-y-2"><label className="text-xs font-bold text-gray-400 uppercase">賞金 (NT$)</label><input type="number" placeholder="50" value={configForm.price} onChange={e => setConfigForm({...configForm, price:Number(e.target.value)})} className="w-full p-4 bg-gray-50 border-none rounded-2xl font-mono font-bold"/></div>
            </div>
            <div className="space-y-2"><label className="text-xs font-bold text-gray-400 uppercase">產生頻率</label><div className="flex items-center gap-3 bg-gray-50 p-4 rounded-2xl"><span>每</span><input type="number" value={configForm.freq} onChange={e => setConfigForm({...configForm, freq:Number(e.target.value)})} className="w-20 text-center bg-white border-none rounded-lg font-bold py-1"/><span>天自動產生一次</span></div></div>
            <div className="space-y-2"><label className="text-xs font-bold text-gray-400 uppercase">預設負責人</label><select value={configForm.defaultAssigneeId} onChange={e => setConfigForm({...configForm, defaultAssigneeId:e.target.value})} className="w-full p-4 bg-gray-50 border-none rounded-2xl font-bold appearance-none">{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
          </div>
          <div className="p-6 border-t bg-white"><button onClick={saveConfig} className="w-full py-4 bg-[#28C8C8] text-white rounded-2xl font-bold text-lg shadow-xl shadow-[#28C8C8]/30 active:scale-95 transition-transform">儲存規則</button></div>
        </div>
      )}
    </div>
  );
}

const History = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
);