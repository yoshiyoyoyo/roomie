import React, { useState, useEffect } from 'react';
import liff from '@line/liff';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, update, serverTimestamp, remove, get } from "firebase/database";
import { 
  Trash2, Sparkles, Wallet, Users, CheckCircle2, Settings, Edit2, X, 
  CalendarDays, UserPlus, List, ChevronLeft, ChevronRight,
  Calendar, ChevronDown, ChevronUp, Check, Loader2, LogOut, Home, RefreshCw, Plus
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

  // 初始化
  useEffect(() => {
    liff.init({ liffId: LIFF_ID }).then(async () => {
      if (!liff.isLoggedIn()) { liff.login(); return; }
      const profile = await liff.getProfile();
      const user = { id: profile.userId, name: profile.displayName, avatar: profile.pictureUrl };
      setCurrentUser(user);
      
      const saved = JSON.parse(localStorage.getItem('roomie_groups') || '[]');
      setMyGroups(saved);

      const gId = new URLSearchParams(window.location.search).get('g');
      if (gId) enterGroup(gId, user); else setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const enterGroup = async (gId, user) => {
    setLoading(true);
    setGroupId(gId);
    onValue(ref(db, `groups/${gId}`), (snap) => {
      const data = snap.val();
      if (data) {
        const rawUsers = data.users ? Object.values(data.users) : [];
        setUsers(rawUsers.filter(u => u && u.id));
        const rawConfigs = data.taskConfigs ? Object.values(data.taskConfigs) : [];
        setTaskConfigs(rawConfigs.filter(c => c && c.id));
        const rawTasks = data.tasks ? Object.values(data.tasks) : [];
        setCurrentCycleTasks(rawTasks.filter(t => t && t.id).sort((a,b) => (a.date || '').localeCompare(b.date || '')));
        const rawLogs = data.logs ? Object.values(data.logs) : [];
        setLogs(rawLogs.filter(l => l && l.id).sort((a,b) => b.id - a.id));
        setGroupName(data.metadata?.name || '我的空間');
        
        // 紀錄到首頁列表
        const saved = JSON.parse(localStorage.getItem('roomie_groups') || '[]');
        if (!saved.find(g => g.id === gId)) {
          const updated = [{ id: gId, name: data.metadata?.name || '家事空間' }, ...saved].slice(0, 5);
          localStorage.setItem('roomie_groups', JSON.stringify(updated));
          setMyGroups(updated);
        }
        if (user && (!data.users || !data.users[user.id])) registerMember(gId, user);
        setViewState('app');
      } else { setViewState('landing'); }
      setLoading(false);
    });
  };

  const registerMember = (gId, user) => {
    update(ref(db, `groups/${gId}/users/${user.id}`), { ...user, balance: 0 });
    addLog(gId, `👋 ${user.name} 加入了空間`, 'success');
  };

  const addLog = (gId, msg, type = 'info') => {
    const id = Date.now();
    set(ref(db, `groups/${gId}/logs/${id}`), { id, msg, type, time: new Date().toLocaleTimeString() });
  };

  // --- 核心邏輯 ---
  const completeTask = async (task) => {
    await update(ref(db, `groups/${groupId}/tasks/${task.id}`), { status: 'done' });
    addLog(groupId, `✅ ${currentUser.name} 完成了: ${task.name}`, 'success');
  };

  const releaseTask = async (task) => {
    const myBal = users.find(u => u.id === currentUser.id)?.balance || 0;
    const updates = {};
    updates[`groups/${groupId}/tasks/${task.id}/status`] = 'open';
    updates[`groups/${groupId}/tasks/${task.id}/currentHolderId`] = null;
    updates[`groups/${groupId}/users/${currentUser.id}/balance`] = myBal - (task.price || 0);
    await update(ref(db), updates);
    addLog(groupId, `💸 ${currentUser.name} 釋出賞金任務: ${task.name} ($${task.price})`, 'warning');
  };

  const claimTask = async (task) => {
    const myBal = users.find(u => u.id === currentUser.id)?.balance || 0;
    const updates = {};
    updates[`groups/${groupId}/tasks/${task.id}/status`] = 'pending';
    updates[`groups/${groupId}/tasks/${task.id}/currentHolderId`] = currentUser.id;
    updates[`groups/${groupId}/users/${currentUser.id}/balance`] = myBal + (task.price || 0);
    await update(ref(db), updates);
    addLog(groupId, `💰 ${currentUser.name} 接手了任務: ${task.name}`, 'success');
  };

  const saveConfig = async () => {
    const id = editingConfigId || `cfg-${generateId()}`;
    const configData = { ...configForm, id, freq: `每 ${configForm.freq} 天`, defaultAssigneeId: configForm.defaultAssigneeId || currentUser.id };
    await update(ref(db), { [`groups/${groupId}/taskConfigs/${id}`]: configData });
    setIsEditingConfig(false);
    if (!editingConfigId && confirm("已儲存規則！是否立即產生任務？")) {
      const tid = `task-${generateId()}`;
      await set(ref(db, `groups/${groupId}/tasks/${tid}`), { ...configData, id: tid, date: getTodayString(), status: 'pending', currentHolderId: configData.defaultAssigneeId });
    }
  };

  // UI
  if (loading) return <div className="h-screen flex flex-col items-center justify-center bg-gray-50"><Loader2 className="animate-spin text-[#28C8C8] mb-2" size={40}/><p className="text-gray-400 text-sm">載入中...</p></div>;

  if (viewState === 'landing') return (
    <div className="max-w-md mx-auto h-screen bg-gray-50 flex flex-col p-8">
      <div className="flex-1">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Roomie Task</h1>
        <p className="text-gray-400 mb-10">選擇空間或建立新的家</p>
        <div className="space-y-4">
          {myGroups.map(g => (
            <div key={g.id} onClick={() => enterGroup(g.id, currentUser)} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center active:scale-95 transition-all">
              <div className="flex items-center gap-4"><div className="w-12 h-12 bg-[#28C8C8]/10 rounded-full flex items-center justify-center text-[#28C8C8]"><Home size={24}/></div><span className="font-bold text-gray-700">{g.name}</span></div>
              <ChevronRight size={20} className="text-gray-300"/>
            </div>
          ))}
        </div>
      </div>
      <button onClick={async () => {
        const gid = `rm-${generateId()}`;
        await set(ref(db, `groups/${gid}`), { metadata: { name: `${currentUser.name} 的家` }, users: { [currentUser.id]: { ...currentUser, balance: 0 } }, logs: { [Date.now()]: { id: Date.now(), msg: '🏠 空間已建立', type: 'info', time: new Date().toLocaleTimeString() } } });
        window.location.href = `https://liff.line.me/${LIFF_ID}?g=${gid}`;
      }} className="bg-[#28C8C8] text-white py-5 rounded-3xl font-bold shadow-xl shadow-[#28C8C8]/30 active:scale-95 transition-all">+ 建立新空間</button>
    </div>
  );

  return (
    <div className="max-w-md mx-auto h-screen bg-gray-50 flex flex-col overflow-hidden">
      <header className="bg-white p-4 border-b flex justify-between items-center shadow-sm z-10">
        <div className="flex items-center gap-2" onClick={() => window.location.href = `https://liff.line.me/${LIFF_ID}`}>
          <ChevronLeft size={24} className="text-gray-400"/><h1 className="font-bold text-lg truncate max-w-[150px]">{groupName}</h1>
        </div>
        <div className="flex items-center gap-2 bg-gray-100 p-1 pr-4 rounded-full">
          <img src={currentUser?.avatar} className="w-8 h-8 rounded-full border-2 border-white"/>
          <span className="text-xs font-bold text-gray-700">{currentUser?.name}</span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-28 space-y-6">
        {view === 'roster' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex bg-gray-200 p-1 rounded-2xl">
              <button onClick={() => setRosterViewMode('list')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${rosterViewMode === 'list' ? 'bg-white text-[#28C8C8] shadow-sm' : 'text-gray-500'}`}>清單模式</button>
              <button onClick={() => setRosterViewMode('calendar')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${rosterViewMode === 'calendar' ? 'bg-white text-[#28C8C8] shadow-sm' : 'text-gray-500'}`}>日曆模式</button>
            </div>

            {rosterViewMode === 'list' ? (
              <div className="space-y-6">
                <section>
                  <div className="flex justify-between items-center mb-3 px-1" onClick={() => setIsMyTasksOpen(!isMyTasksOpen)}>
                    <h3 className="font-bold text-gray-800 flex items-center gap-2 text-lg"><CheckCircle2 size={20} className="text-[#28C8C8]"/> 我的待辦</h3>
                    {isMyTasksOpen ? <ChevronUp size={20} className="text-gray-400"/> : <ChevronDown size={20} className="text-gray-400"/>}
                  </div>
                  {isMyTasksOpen && (
                    <div className="space-y-3">
                      {currentCycleTasks.filter(t => t.currentHolderId === currentUser?.id && t.status === 'pending').map(task => (
                        <div key={task.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between animate-in slide-in-from-bottom-2">
                          <div className="flex items-center gap-4">
                            <span className="text-3xl">{task.icon}</span>
                            <div><div className="font-bold text-gray-800">{task.name}</div><div className="text-[11px] font-bold text-red-400 mt-1">{task.date === getTodayString() ? '今天' : task.date}</div></div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => releaseTask(task)} className="bg-red-50 text-red-500 px-4 py-2 rounded-xl text-xs font-bold">沒空</button>
                            <button onClick={() => completeTask(task)} className="bg-[#28C8C8] text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md shadow-[#28C8C8]/20">完成</button>
                          </div>
                        </div>
                      ))}
                      {currentCycleTasks.filter(t => t.currentHolderId === currentUser?.id && t.status === 'pending').length === 0 && <div className="text-center py-10 text-gray-300 italic text-sm">目前沒有任務，太輕鬆了吧！ 🎉</div>}
                    </div>
                  )}
                </section>

                <section>
                  <div className="flex justify-between items-center mb-3 px-1" onClick={() => setIsTaskListOpen(!isTaskListOpen)}>
                    <h3 className="font-bold text-gray-600 flex items-center gap-2 text-lg"><Users size={20}/> 任務列表</h3>
                    {isTaskListOpen ? <ChevronUp size={20} className="text-gray-400"/> : <ChevronDown size={20} className="text-gray-400"/>}
                  </div>
                  {isTaskListOpen && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
                      {currentCycleTasks.map(task => {
                        const isOpen = task.status === 'open';
                        const isDone = task.status === 'done';
                        const holder = users.find(u => u.id === task.currentHolderId);
                        return (
                          <div key={task.id} className={`p-4 flex items-center justify-between ${isOpen ? 'bg-red-50/50' : ''}`}>
                            <div className="flex items-center gap-4">
                              <span className={`text-2xl ${isDone ? 'opacity-30 grayscale' : ''}`}>{task.icon}</span>
                              <div>
                                <div className={`font-bold text-sm ${isDone ? 'text-gray-300 line-through' : 'text-gray-800'}`}>{task.name}</div>
                                <div className="text-[10px] text-gray-400 mt-0.5">{task.date} · {isOpen ? <span className="text-red-500 font-bold animate-pulse">賞金中 ${task.price}</span> : (holder?.name || '待分配')}</div>
                              </div>
                            </div>
                            {isOpen && <button onClick={() => claimTask(task)} className="bg-red-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-red-200">接單</button>}
                            {isDone && <div className="w-8 h-8 bg-green-50 rounded-full flex items-center justify-center text-green-400"><Check size={20}/></div>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
              </div>
            ) : (
              <div className="bg-white p-10 rounded-3xl shadow-sm border border-dashed text-center text-gray-400">日曆模式整合中</div>
            )}
          </div>
        )}

        {view === 'wallet' && (
          <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
            <div className="bg-gradient-to-br from-[#28C8C8] to-[#1facac] p-8 rounded-[2rem] text-white shadow-xl shadow-[#28C8C8]/30 flex justify-between items-center">
              <div><div className="text-sm opacity-80 mb-2 font-medium">我的結餘 (NT$)</div><div className="text-5xl font-bold font-mono tracking-tighter">${users.find(u => u.id === currentUser?.id)?.balance || 0}</div></div>
              <Wallet size={64} className="opacity-20"/>
            </div>
            <div className="bg-white rounded-[2rem] border border-gray-100 divide-y divide-gray-50 shadow-sm overflow-hidden">
              {users.map(u => (
                <div key={u.id} className="p-5 flex justify-between items-center">
                  <div className="flex items-center gap-4"><img src={u.avatar} className="w-12 h-12 rounded-full border-4 border-gray-50 shadow-sm"/><span className="font-bold text-gray-700">{u.name}</span></div>
                  <span className={`font-mono font-bold text-xl ${u.balance >= 0 ? 'text-[#28C8C8]' : 'text-red-500'}`}>{u.balance >= 0 ? '+' : ''}{u.balance}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'history' && (
          <div className="space-y-6 pl-6 border-l-2 border-gray-100 ml-4 py-2 animate-in slide-in-from-right-4">
            {logs.map(log => (
              <div key={log.id} className="relative pb-2">
                <div className={`absolute -left-[33px] top-1 w-4 h-4 rounded-full border-4 border-white shadow-sm ${log.type === 'success' ? 'bg-green-400' : log.type === 'warning' ? 'bg-red-400' : 'bg-[#28C8C8]'}`}></div>
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-50"><div className="text-sm text-gray-800 font-bold">{log.msg}</div><div className="text-[10px] text-gray-400 mt-2 flex items-center gap-1 font-mono uppercase"><Calendar size={10}/> {log.time}</div></div>
              </div>
            ))}
          </div>
        )}

        {view === 'settings' && (
          <div className="space-y-6 animate-in slide-in-from-right-4">
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex justify-between items-center">
              <div><div className="font-bold text-gray-800 text-lg">邀請室友</div><div className="text-xs text-gray-400 mt-1">目前成員 {users.length} 位</div></div>
              <button onClick={shareInvite} className="bg-[#28C8C8] text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-[#28C8C8]/20">發送連結</button>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-5">
              <div className="flex justify-between items-center"><h3 className="font-bold text-gray-800 text-lg">家事規則</h3><button onClick={() => { setEditingConfigId(null); setConfigForm({ name: '', price: 30, freq: 7, icon: '🧹', defaultAssigneeId: currentUser.id }); setIsEditingConfig(true); }} className="text-[#28C8C8] text-sm font-bold flex items-center gap-1"><Plus size={18}/> 新增</button></div>
              <div className="space-y-3">
                {taskConfigs.map(c => (
                  <div key={c.id} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl group transition-all">
                    <div className="flex items-center gap-4"><span className="text-3xl">{c.icon}</span><div><div className="font-bold text-gray-800">{c.name}</div><div className="text-[11px] text-gray-400 mt-1 font-bold">${c.price} / {c.freq}</div></div></div>
                    <div className="flex gap-4 text-gray-300">
                      <Edit2 size={20} className="hover:text-[#28C8C8] cursor-pointer" onClick={() => { setEditingConfigId(c.id); setConfigForm({ ...c, freq: parseInt(String(c.freq).match(/\d+/)?.[0] || '7') }); setIsEditingConfig(true); }}/>
                      <Trash2 size={20} className="hover:text-red-400 cursor-pointer" onClick={() => { if(confirm("確定刪除？")) remove(ref(db, `groups/${groupId}/taskConfigs/${c.id}`)); }}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={() => { if(confirm("確定退出？")) { localStorage.clear(); window.location.href=`https://liff.line.me/${LIFF_ID}`; } }} className="w-full py-4 text-red-400 text-sm font-bold border-2 border-red-50 rounded-2xl bg-red-50/20">退出此空間</button>
          </div>
        )}
      </main>

      <nav className="bg-white/80 backdrop-blur-md border-t flex justify-around pb-10 pt-3 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] fixed bottom-0 w-full max-w-md">
        {[{id:'roster', icon:CalendarDays, label:'值日表'}, {id:'wallet', icon:Wallet, label:'帳本'}, {id:'history', icon:History, label:'動態'}, {id:'settings', icon:Settings, label:'設定'}].map(n => (
          <button key={n.id} onClick={() => setView(n.id)} className={`flex flex-col items-center w-full py-2 transition-all ${view === n.id ? 'text-[#28C8C8] scale-110' : 'text-gray-300'}`}><n.icon size={26}/><span className="text-[10px] font-bold mt-1.5">{n.label}</span></button>
        ))}
      </nav>

      {/* Editor Modal */}
      {isEditingConfig && (
        <div className="fixed inset-0 bg-white z-[100] flex flex-col animate-in slide-in-from-bottom duration-300">
          <div className="p-6 border-b flex justify-between items-center bg-gray-50">
            <h2 className="text-xl font-bold text-gray-800">{editingConfigId ? '編輯規則' : '新增規則'}</h2>
            <button onClick={() => setIsEditingConfig(false)} className="p-2 bg-white rounded-full shadow-sm"><X size={24}/></button>
          </div>
          <div className="p-8 space-y-8 flex-1 overflow-y-auto">
            <div className="space-y-3"><label className="text-xs font-black text-gray-400 uppercase tracking-widest">家事名稱</label><input type="text" placeholder="例如：倒垃圾" value={configForm.name} onChange={e => setConfigForm({...configForm, name:e.target.value})} className="w-full p-5 bg-gray-50 border-none rounded-2xl text-lg font-bold focus:ring-4 focus:ring-[#28C8C8]/20"/></div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3"><label className="text-xs font-black text-gray-400 uppercase tracking-widest">圖示</label><input type="text" value={configForm.icon} onChange={e => setConfigForm({...configForm, icon:e.target.value})} className="w-full p-5 bg-gray-50 border-none rounded-2xl text-center text-3xl"/></div>
              <div className="space-y-3"><label className="text-xs font-black text-gray-400 uppercase tracking-widest">賞金 (NT$)</label><input type="number" value={configForm.price} onChange={e => setConfigForm({...configForm, price:Number(e.target.value)})} className="w-full p-5 bg-gray-50 border-none rounded-2xl font-mono text-xl font-bold"/></div>
            </div>
            <div className="space-y-3"><label className="text-xs font-black text-gray-400 uppercase tracking-widest">產生頻率</label><div className="flex items-center gap-4 bg-gray-50 p-5 rounded-2xl"><span>每</span><input type="number" value={configForm.freq} onChange={e => setConfigForm({...configForm, freq:Number(e.target.value)})} className="w-24 text-center bg-white border-none rounded-xl font-bold py-2 shadow-sm"/><span>天產生一次</span></div></div>
            <div className="space-y-3"><label className="text-xs font-black text-gray-400 uppercase tracking-widest">預設負責人</label><select value={configForm.defaultAssigneeId} onChange={e => setConfigForm({...configForm, defaultAssigneeId:e.target.value})} className="w-full p-5 bg-gray-50 border-none rounded-2xl font-bold appearance-none">{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
          </div>
          <div className="p-8 border-t"><button onClick={saveConfig} className="w-full py-5 bg-[#28C8C8] text-white rounded-[2rem] font-bold text-xl shadow-2xl shadow-[#28C8C8]/40 active:scale-95 transition-all">儲存並應用</button></div>
        </div>
      )}
    </div>
  );
}

const History = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
);