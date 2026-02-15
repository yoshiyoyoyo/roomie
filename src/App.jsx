import React, { useState, useEffect } from 'react';
import liff from '@line/liff';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, update, serverTimestamp, remove, get } from "firebase/database";
import { 
  Trash2, Sparkles, Wallet, Users, CheckCircle2, Settings, Edit2, X, 
  CalendarDays, UserPlus, List, ChevronLeft, ChevronRight,
  Calendar, ChevronDown, ChevronUp, Check, Loader2, LogOut, Home, RefreshCw, DollarSign
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
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(getTodayString());
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
    });
  }, []);

  const enterGroup = async (gId, user) => {
    setLoading(true);
    setGroupId(gId);
    onValue(ref(db, `groups/${gId}`), (snap) => {
      const data = snap.val();
      if (data) {
        setUsers(data.users ? Object.values(data.users) : []);
        setTaskConfigs(data.taskConfigs ? Object.values(data.taskConfigs) : []);
        const tList = data.tasks ? Object.values(data.tasks) : [];
        setCurrentCycleTasks(tList.sort((a,b) => (a.date || '').localeCompare(b.date || '')));
        const lList = data.logs ? Object.values(data.logs) : [];
        setLogs(lList.sort((a,b) => b.id - a.id));
        setGroupName(data.metadata?.name || '家');
        setViewState('app');
        if (user && (!data.users || !data.users[user.id])) registerMember(gId, user);
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

  // --- 家事操作 ---
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
    addLog(groupId, `💸 ${currentUser.name} 釋出任務並支付賞金 $${task.price}`, 'warning');
  };

  const claimTask = async (task) => {
    const myBal = users.find(u => u.id === currentUser.id)?.balance || 0;
    const updates = {};
    updates[`groups/${groupId}/tasks/${task.id}/status`] = 'pending';
    updates[`groups/${groupId}/tasks/${task.id}/currentHolderId`] = currentUser.id;
    updates[`groups/${groupId}/users/${currentUser.id}/balance`] = myBal + (task.price || 0);
    await update(ref(db), updates);
    addLog(groupId, `💰 ${currentUser.name} 接手了賞金任務: ${task.name}`, 'success');
  };

  const saveConfig = async () => {
    const id = editingConfigId || `cfg-${generateId()}`;
    const configData = { ...configForm, id, freq: `每 ${configForm.freq} 天`, defaultAssigneeId: configForm.defaultAssigneeId || currentUser.id };
    await update(ref(db), { [`groups/${groupId}/taskConfigs/${id}`]: configData });
    setIsEditingConfig(false);
    
    if (!editingConfigId && confirm("已儲存規則！是否立即在值日表中產生此任務？")) {
      const tid = `task-${generateId()}`;
      await set(ref(db, `groups/${groupId}/tasks/${tid}`), {
        id: tid, ...configData, date: getTodayString(), status: 'pending', currentHolderId: configData.defaultAssigneeId
      });
    }
  };

  // UI 渲染
  if (loading) return <div className="h-screen flex items-center justify-center bg-gray-50"><Loader2 className="animate-spin text-[#28C8C8]" size={40}/></div>;

  if (viewState === 'landing') return (
    <div className="max-w-md mx-auto h-screen bg-gray-50 flex flex-col p-6">
      <h1 className="text-2xl font-bold mb-6">🏠 我的家事空間</h1>
      <div className="flex-1 space-y-4">
        {myGroups.map(g => (
          <div key={g.id} onClick={() => enterGroup(g.id, currentUser)} className="bg-white p-4 rounded-xl shadow-sm flex justify-between items-center">
            <span className="font-bold">{g.name}</span><ChevronRight size={18} className="text-gray-300"/>
          </div>
        ))}
      </div>
      <button onClick={async () => {
        const gid = `rm-${generateId()}`;
        await set(ref(db, `groups/${gid}`), { metadata: { name: `${currentUser.name} 的家` }, users: { [currentUser.id]: { ...currentUser, balance: 0 } } });
        window.location.href = `https://liff.line.me/${LIFF_ID}?g=${gid}`;
      }} className="bg-[#28C8C8] text-white py-4 rounded-2xl font-bold shadow-lg">+ 建立新空間</button>
    </div>
  );

  return (
    <div className="max-w-md mx-auto h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white p-4 border-b flex justify-between items-center">
        <div className="flex items-center gap-2" onClick={() => window.location.href = `https://liff.line.me/${LIFF_ID}`}>
          <ChevronLeft size={20}/><h1 className="font-bold truncate max-w-[120px]">{groupName}</h1>
        </div>
        <div className="flex items-center gap-2 bg-gray-100 p-1 pr-3 rounded-full">
          <img src={currentUser?.avatar} className="w-6 h-6 rounded-full"/>
          <span className="text-[10px] font-bold">{currentUser?.name}</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 pb-24">
        {view === 'roster' && (
          <div className="space-y-6">
            <div className="flex bg-gray-200 p-1 rounded-xl">
              <button onClick={() => setRosterViewMode('list')} className={`flex-1 py-2 rounded-lg text-sm font-bold ${rosterViewMode === 'list' ? 'bg-white text-[#28C8C8]' : 'text-gray-500'}`}>清單模式</button>
              <button onClick={() => setRosterViewMode('calendar')} className={`flex-1 py-2 rounded-lg text-sm font-bold ${rosterViewMode === 'calendar' ? 'bg-white text-[#28C8C8]' : 'text-gray-500'}`}>日曆模式</button>
            </div>

            {rosterViewMode === 'list' ? (
              <div className="space-y-6">
                <section>
                  <div className="flex justify-between items-center mb-2" onClick={() => setIsMyTasksOpen(!isMyTasksOpen)}>
                    <h3 className="font-bold text-gray-700 flex items-center gap-2"><CheckCircle2 size={18} className="text-[#28C8C8]"/> 我的待辦</h3>
                    {isMyTasksOpen ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                  </div>
                  {isMyTasksOpen && (
                    <div className="bg-white rounded-xl shadow-sm border divide-y">
                      {currentCycleTasks.filter(t => t.currentHolderId === currentUser?.id && t.status === 'pending').map(task => (
                        <div key={task.id} className="p-4 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{task.icon}</span>
                            <div><div className="font-bold text-sm">{task.name}</div><div className="text-[10px] text-gray-400">{task.date}</div></div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => releaseTask(task)} className="bg-red-50 text-red-500 px-3 py-1.5 rounded-lg text-xs font-bold">沒空</button>
                            <button onClick={() => completeTask(task)} className="bg-[#28C8C8] text-white px-3 py-1.5 rounded-lg text-xs font-bold">完成</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <div className="flex justify-between items-center mb-2" onClick={() => setIsTaskListOpen(!isTaskListOpen)}>
                    <h3 className="font-bold text-gray-700 flex items-center gap-2"><Users size={18} className="text-gray-400"/> 任務列表</h3>
                    {isTaskListOpen ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                  </div>
                  {isTaskListOpen && (
                    <div className="bg-white rounded-xl shadow-sm border divide-y">
                      {currentCycleTasks.map(task => {
                        const isOpen = task.status === 'open';
                        const isDone = task.status === 'done';
                        const holder = users.find(u => u.id === task.currentHolderId);
                        return (
                          <div key={task.id} className={`p-4 flex items-center justify-between ${isOpen ? 'bg-red-50' : ''}`}>
                            <div className="flex items-center gap-3">
                              <span className={`text-2xl ${isDone ? 'opacity-30' : ''}`}>{task.icon}</span>
                              <div>
                                <div className="font-bold text-sm flex items-center gap-2">{task.name} {isOpen && <span className="bg-red-500 text-white text-[8px] px-1 rounded animate-pulse">賞金 $${task.price}</span>}</div>
                                <div className="text-[10px] text-gray-400">{task.date} · {isOpen ? '徵求中' : (holder?.name || '未分配')}</div>
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
              <div className="bg-white p-4 rounded-xl shadow-sm text-center py-20 text-gray-400">日曆功能已整合資料</div>
            )}
          </div>
        )}

        {view === 'wallet' && (
          <div className="space-y-4">
            <div className="bg-[#28C8C8] p-6 rounded-2xl text-white shadow-lg">
              <div className="text-xs opacity-70">我的結餘</div>
              <div className="text-4xl font-bold font-mono">${users.find(u => u.id === currentUser?.id)?.balance || 0}</div>
            </div>
            <div className="bg-white rounded-xl border divide-y">
              {users.map(u => (
                <div key={u.id} className="p-4 flex justify-between items-center">
                  <div className="flex items-center gap-3"><img src={u.avatar} className="w-8 h-8 rounded-full"/><span className="font-bold text-sm">{u.name}</span></div>
                  <span className={`font-mono font-bold ${u.balance >= 0 ? 'text-[#28C8C8]' : 'text-red-500'}`}>{u.balance >= 0 ? '+' : ''}{u.balance}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'history' && (
          <div className="space-y-4 pl-4 border-l-2 border-gray-100 ml-2">
            {logs.map(log => (
              <div key={log.id} className="relative pb-4">
                <div className={`absolute -left-[23px] top-1 w-3 h-3 rounded-full border-2 border-white ${log.type === 'success' ? 'bg-green-500' : log.type === 'warning' ? 'bg-red-500' : 'bg-gray-400'}`}></div>
                <div className="text-xs text-gray-800">{log.msg}</div>
                <div className="text-[8px] text-gray-400">{log.time}</div>
              </div>
            ))}
          </div>
        )}

        {view === 'settings' && (
          <div className="space-y-6">
            <div className="bg-white p-4 rounded-xl border flex justify-between items-center">
              <div><div className="font-bold text-sm">邀請室友</div><div className="text-[10px] text-gray-400">目前 {users.length} 人</div></div>
              <button onClick={async () => {
                const link = `https://liff.line.me/${LIFF_ID}?g=${groupId}`;
                if (liff.isApiAvailable('shareTargetPicker')) await liff.shareTargetPicker([{ type: "text", text: `🏠 加入「${groupName}」：\n${link}` }]);
                else { navigator.clipboard.writeText(link); alert("已複製"); }
              }} className="bg-[#28C8C8] text-white px-4 py-2 rounded-xl text-xs font-bold">發送連結</button>
            </div>

            <div className="bg-white p-4 rounded-xl border space-y-4">
              <div className="flex justify-between items-center"><h3 className="font-bold text-sm">家事規則</h3><button onClick={() => { setEditingConfigId(null); setConfigForm({ name: '', price: 30, freq: 7, icon: '🧹', defaultAssigneeId: currentUser.id }); setIsEditingConfig(true); }} className="text-[#28C8C8] text-xs font-bold">+ 新增</button></div>
              <div className="space-y-2">
                {taskConfigs.map(c => (
                  <div key={c.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-3"><span className="text-xl">{c.icon}</span><div><div className="font-bold text-sm">{c.name}</div><div className="text-[10px] text-gray-400">${c.price} / {c.freq}</div></div></div>
                    <div className="flex gap-3 text-gray-300">
                      <Edit2 size={16} className="hover:text-[#28C8C8] cursor-pointer" onClick={() => { setEditingConfigId(c.id); setConfigForm({ ...c, freq: parseInt(c.freq.match(/\d+/)[0]) }); setIsEditingConfig(true); }}/>
                      <Trash2 size={16} className="hover:text-red-500 cursor-pointer" onClick={() => remove(ref(db, `groups/${groupId}/taskConfigs/${c.id}`))}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={() => { if(confirm("確定登出空間？")) { localStorage.clear(); window.location.href=`https://liff.line.me/${LIFF_ID}`; } }} className="w-full py-3 text-red-400 text-xs font-bold border border-red-100 rounded-xl">退出此空間</button>
          </div>
        )}
      </main>

      {/* Footer Nav */}
      <nav className="bg-white border-t flex justify-around pb-8 pt-2">
        {[{id:'roster', icon:CalendarDays, label:'值日表'}, {id:'wallet', icon:Wallet, label:'帳本'}, {id:'history', icon:History, label:'動態'}, {id:'settings', icon:Settings, label:'設定'}].map(n => (
          <button key={n.id} onClick={() => setView(n.id)} className={`flex flex-col items-center w-full py-2 ${view === n.id ? 'text-[#28C8C8]' : 'text-gray-400'}`}><n.icon size={22}/><span className="text-[10px] font-bold mt-1">{n.label}</span></button>
        ))}
      </nav>

      {/* Editor Modal */}
      {isEditingConfig && (
        <div className="fixed inset-0 bg-white z-50 flex flex-col">
          <div className="p-4 border-b flex justify-between items-center bg-gray-50">
            <h2 className="font-bold">{editingConfigId ? '編輯規則' : '新增規則'}</h2>
            <button onClick={() => setIsEditingConfig(false)}><X/></button>
          </div>
          <div className="p-6 space-y-6 flex-1">
            <input type="text" placeholder="名稱 (如：倒垃圾)" value={configForm.name} onChange={e => setConfigForm({...configForm, name:e.target.value})} className="w-full p-4 border rounded-xl"/>
            <div className="flex gap-4">
              <input type="text" placeholder="圖示" value={configForm.icon} onChange={e => setConfigForm({...configForm, icon:e.target.value})} className="w-20 p-4 border rounded-xl text-center text-2xl"/>
              <input type="number" placeholder="金額" value={configForm.price} onChange={e => setConfigForm({...configForm, price:Number(e.target.value)})} className="flex-1 p-4 border rounded-xl"/>
            </div>
            <div className="flex items-center gap-2">每 <input type="number" value={configForm.freq} onChange={e => setConfigForm({...configForm, freq:Number(e.target.value)})} className="w-20 p-2 border rounded-lg text-center"/> 天產生一次</div>
            <div className="text-sm font-bold text-gray-500">預設負責人:</div>
            <select value={configForm.defaultAssigneeId} onChange={e => setConfigForm({...configForm, defaultAssigneeId:e.target.value})} className="w-full p-4 border rounded-xl bg-white">
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="p-4 border-t"><button onClick={saveConfig} className="w-full py-4 bg-[#28C8C8] text-white rounded-2xl font-bold text-lg">儲存家事設定</button></div>
        </div>
      )}
    </div>
  );
}