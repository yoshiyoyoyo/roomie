import React, { useState, useEffect } from 'react';
import liff from '@line/liff';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, update, serverTimestamp, remove, get } from "firebase/database";
import { 
  Trash2, Sparkles, Wallet, Users, CheckCircle2, Settings, Edit2, X, 
  CalendarDays, UserPlus, List, ChevronLeft, ChevronRight,
  Calendar, ChevronDown, ChevronUp, Check, Loader2, LogOut, Home, RefreshCw, DollarSign, Plus
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

const getTodayString = () => new Date().toISOString().split('T')[0];
const generateId = () => Math.random().toString(36).substr(2, 9);

export default function RoomieTaskApp() {
  const [loading, setLoading] = useState(true);
  const [viewState, setViewState] = useState('landing'); 
  const [groupId, setGroupId] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false); // 控制頭像選單
  
  const [users, setUsers] = useState([]);
  const [taskConfigs, setTaskConfigs] = useState([]);
  const [currentCycleTasks, setCurrentCycleTasks] = useState([]);
  const [logs, setLogs] = useState([]);

  const [view, setView] = useState('roster');
  const [rosterViewMode, setRosterViewMode] = useState('list');
  const [isMyTasksOpen, setIsMyTasksOpen] = useState(true);
  const [isTaskListOpen, setIsTaskListOpen] = useState(true);

  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState(null);
  const [configForm, setConfigForm] = useState({ name: '', price: 30, freq: 7, icon: '🧹', defaultAssigneeId: '' });

  useEffect(() => {
    liff.init({ liffId: LIFF_ID }).then(async () => {
      if (!liff.isLoggedIn()) { liff.login(); return; }
      const profile = await liff.getProfile();
      const user = { id: profile.userId, name: profile.displayName, avatar: profile.pictureUrl };
      setCurrentUser(user);
      
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
        setUsers(data.users ? Object.values(data.users) : []);
        setTaskConfigs(data.taskConfigs ? Object.values(data.taskConfigs) : []);
        const tList = data.tasks ? Object.values(data.tasks) : [];
        setCurrentCycleTasks(tList.sort((a,b) => (a.date || '').localeCompare(b.date || '')));
        const lList = data.logs ? Object.values(data.logs) : [];
        setLogs(lList.sort((a,b) => b.id - a.id));
        setGroupName(data.metadata?.name || '我的空間');
        setViewState('app');
        if (user && (!data.users || !data.users[user.id])) registerMember(gId, user);
      } else { setViewState('landing'); }
      setLoading(false);
    });
  };

  const registerMember = (gId, user) => {
    update(ref(db, `groups/${gId}/users/${user.id}`), { ...user, balance: 0 });
    const logId = Date.now();
    set(ref(db, `groups/${gId}/logs/${logId}`), { id: logId, msg: `👋 ${user.name} 加入了空間`, type: 'success', time: new Date().toLocaleTimeString() });
  };

  const handleCreateGroup = async () => {
    const name = prompt("請輸入空間名稱 (例如：XX家、402室友)", `${currentUser?.name} 的家`);
    if (!name) return;

    setLoading(true);
    const gid = `rm-${generateId()}`;
    await set(ref(db, `groups/${gid}`), { 
        metadata: { name: name, createdAt: serverTimestamp() }, 
        users: { [currentUser.id]: { ...currentUser, balance: 0 } },
        logs: { [Date.now()]: { id: Date.now(), msg: `🏠 空間「${name}」已建立`, type: 'info', time: new Date().toLocaleTimeString() } } 
    });
    window.location.href = `https://liff.line.me/${LIFF_ID}?g=${gid}`;
  };

  const completeTask = async (task) => {
    await update(ref(db, `groups/${groupId}/tasks/${task.id}`), { status: 'done' });
  };

  const releaseTask = async (task) => {
    const myBal = users.find(u => u.id === currentUser.id)?.balance || 0;
    const updates = {};
    updates[`groups/${groupId}/tasks/${task.id}/status`] = 'open';
    updates[`groups/${groupId}/tasks/${task.id}/currentHolderId`] = null;
    updates[`groups/${groupId}/users/${currentUser.id}/balance`] = myBal - (task.price || 0);
    await update(ref(db), updates);
  };

  const claimTask = async (task) => {
    const myBal = users.find(u => u.id === currentUser.id)?.balance || 0;
    const updates = {};
    updates[`groups/${groupId}/tasks/${task.id}/status`] = 'pending';
    updates[`groups/${groupId}/tasks/${task.id}/currentHolderId`] = currentUser.id;
    updates[`groups/${groupId}/users/${currentUser.id}/balance`] = myBal + (task.price || 0);
    await update(ref(db), updates);
  };

  const saveConfig = async () => {
    const id = editingConfigId || `cfg-${generateId()}`;
    const freqStr = typeof configForm.freq === 'string' ? configForm.freq : `每 ${configForm.freq} 天`;
    const configData = { ...configForm, id, freq: freqStr, defaultAssigneeId: configForm.defaultAssigneeId || currentUser.id };
    await update(ref(db), { [`groups/${groupId}/taskConfigs/${id}`]: configData });
    setIsEditingConfig(false);
    if (!editingConfigId && confirm("已儲存！是否立即在值日表中產生一項任務？")) {
      const tid = `task-${generateId()}`;
      await set(ref(db, `groups/${groupId}/tasks/${tid}`), { ...configData, id: tid, date: getTodayString(), status: 'pending', currentHolderId: configData.defaultAssigneeId });
    }
  };

  // UI
  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[#28C8C8]"/></div>;

  if (viewState === 'landing') return (
    <div className="max-w-md mx-auto h-screen flex flex-col p-8 bg-white justify-center items-center text-center">
      <h1 className="text-3xl font-bold mb-2">👋 嗨，{currentUser?.name}</h1>
      <p className="text-gray-500 mb-10 leading-relaxed">建立專屬家事空間，讓室友輕鬆協作。</p>
      <button onClick={handleCreateGroup} className="w-full py-4 bg-[#28C8C8] text-white rounded-2xl font-bold shadow-xl">建立新空間</button>
    </div>
  );

  return (
    <div className="max-w-md mx-auto h-screen bg-gray-50 flex flex-col overflow-hidden relative">
      {/* Header */}
      <header className="bg-white p-4 border-b flex justify-between items-center z-20">
        <h1 className="font-bold text-lg">{groupName}</h1>
        <div className="relative">
          <div onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="flex items-center gap-2 bg-gray-100 p-1 pr-3 rounded-full cursor-pointer">
            <img src={currentUser?.avatar} className="w-8 h-8 rounded-full border border-white" />
            <span className="text-xs font-bold text-gray-700">{currentUser?.name}</span>
          </div>
          {isUserMenuOpen && (
            <div className="absolute right-0 mt-2 w-40 bg-white border rounded-xl shadow-xl z-50">
               <button onClick={() => { window.location.href=`https://liff.line.me/${LIFF_ID}`; }} className="w-full text-left p-3 text-sm border-b flex items-center gap-2 hover:bg-gray-50"><Home size={16}/> 我的空間</button>
               <button onClick={() => { if(confirm("確定登出此空間？")) { localStorage.clear(); window.location.href=`https://liff.line.me/${LIFF_ID}`; } }} className="w-full text-left p-3 text-sm text-red-500 flex items-center gap-2 hover:bg-gray-50"><LogOut size={16}/> 退出群組</button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 pb-24">
        {view === 'roster' && (
          <div className="space-y-6">
            <section>
              <div className="flex justify-between items-center mb-2" onClick={() => setIsMyTasksOpen(!isMyTasksOpen)}>
                <h3 className="font-bold text-gray-700 flex items-center gap-2"><CheckCircle2 size={18} className="text-[#28C8C8]"/> 我的待辦</h3>
                {isMyTasksOpen ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
              </div>
              {isMyTasksOpen && (
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                  {currentCycleTasks.filter(t => t.currentHolderId === currentUser?.id && t.status === 'pending').length === 0 ? 
                    <div className="p-8 text-center text-gray-400 text-sm">目前沒有任務 🎉</div> :
                    currentCycleTasks.filter(t => t.currentHolderId === currentUser?.id && t.status === 'pending').map(task => (
                      <div key={task.id} className="p-4 flex items-center justify-between border-b last:border-0">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{task.icon}</span>
                          <div><div className="font-bold text-sm">{task.name}</div><div className="text-[10px] text-gray-400">{task.date}</div></div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => releaseTask(task)} className="bg-red-50 text-red-500 px-3 py-1 rounded text-xs font-bold">沒空</button>
                          <button onClick={() => completeTask(task)} className="bg-[#28C8C8] text-white px-3 py-1 rounded text-xs font-bold">完成</button>
                        </div>
                      </div>
                    ))
                  }
                </div>
              )}
            </section>

            <section>
              <div className="flex justify-between items-center mb-2" onClick={() => setIsTaskListOpen(!isTaskListOpen)}>
                <h3 className="font-bold text-gray-700 flex items-center gap-2"><Users size={18}/> 任務列表</h3>
                {isTaskListOpen ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
              </div>
              {isTaskListOpen && (
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                  {currentCycleTasks.length === 0 ? 
                    <div className="p-8 text-center text-gray-400 text-sm">目前沒有任務 🎉</div> :
                    currentCycleTasks.map(task => {
                      const isOpen = task.status === 'open';
                      const isDone = task.status === 'done';
                      return (
                        <div key={task.id} className={`p-4 flex items-center justify-between border-b last:border-0 ${isOpen ? 'bg-red-50' : ''}`}>
                          <div className="flex items-center gap-3">
                            <span className={`text-2xl ${isDone ? 'opacity-30' : ''}`}>{task.icon}</span>
                            <div>
                              <div className="font-bold text-sm">{task.name} {isOpen && <span className="text-red-500 animate-pulse text-[10px] ml-1">賞金中</span>}</div>
                              <div className="text-[10px] text-gray-400">{task.date}</div>
                            </div>
                          </div>
                          {isOpen && <button onClick={() => claimTask(task)} className="bg-red-500 text-white px-3 py-1 rounded text-xs font-bold">接單 +${task.price}</button>}
                          {isDone && <CheckCircle2 className="text-green-300" size={20}/>}
                        </div>
                      )
                    })
                  }
                </div>
              )}
            </section>
          </div>
        )}

        {view === 'wallet' && (
          <div className="space-y-4">
            <div className="bg-[#28C8C8] p-6 rounded-2xl text-white">
              <div className="text-xs opacity-80">我的結餘</div>
              <div className="text-3xl font-bold font-mono">${users.find(u => u.id === currentUser?.id)?.balance || 0}</div>
            </div>
            <div className="bg-white rounded-xl border divide-y">
               {users.map(u => (
                 <div key={u.id} className="p-4 flex justify-between items-center">
                   <div className="flex items-center gap-3"><img src={u.avatar} className="w-8 h-8 rounded-full"/><span className="font-bold text-sm">{u.name}</span></div>
                   <span className={`font-bold font-mono ${u.balance >= 0 ? 'text-[#28C8C8]' : 'text-red-500'}`}>{u.balance >= 0 ? '+' : ''}{u.balance}</span>
                 </div>
               ))}
            </div>
          </div>
        )}

        {view === 'history' && (
          <div className="space-y-4 pl-4 border-l-2 border-gray-100 ml-2">
            {logs.map(log => (
              <div key={log.id} className="relative pb-4">
                <div className={`absolute -left-[23px] top-1 w-3 h-3 rounded-full border-2 border-white ${log.type === 'success' ? 'bg-green-500' : 'bg-[#28C8C8]'}`}></div>
                <div className="text-sm">{log.msg}</div>
                <div className="text-[10px] text-gray-400">{log.time}</div>
              </div>
            ))}
          </div>
        )}

        {view === 'settings' && (
          <div className="space-y-6">
            <div className="bg-white p-4 rounded-xl border flex justify-between items-center">
               <h3 className="font-bold">邀請室友</h3>
               <button onClick={async () => {
                 const link = `https://liff.line.me/${LIFF_ID}?g=${groupId}`;
                 if (liff.isApiAvailable('shareTargetPicker')) await liff.shareTargetPicker([{ type: "text", text: `🏠 加入我的家事空間：\n${link}` }]);
                 else { navigator.clipboard.writeText(link); alert("已複製連結"); }
               }} className="bg-[#28C8C8] text-white px-4 py-2 rounded-xl text-xs font-bold">發送邀請</button>
            </div>

            <div className="bg-white p-4 rounded-xl border space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold">家事規則</h3>
                <button onClick={() => { setEditingConfigId(null); setConfigForm({ name: '', price: 30, freq: 7, icon: '🧹', defaultAssigneeId: currentUser.id }); setIsEditingConfig(true); }} className="text-[#28C8C8] text-xs font-bold">+ 新增</button>
              </div>
              <div className="space-y-2">
                {taskConfigs.map(c => (
                  <div key={c.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-3"><span className="text-xl">{c.icon}</span><div className="font-bold text-sm">{c.name}</div></div>
                    <div className="flex gap-4">
                      <Edit2 size={16} className="text-gray-300" onClick={() => { 
                         setEditingConfigId(c.id); 
                         const freqNum = c.freq && typeof c.freq === 'string' ? parseInt(c.freq.match(/\d+/)?.[0] || '7') : 7;
                         setConfigForm({ ...c, freq: freqNum }); 
                         setIsEditingConfig(true); 
                      }}/>
                      <Trash2 size={16} className="text-gray-300" onClick={() => remove(ref(db, `groups/${groupId}/taskConfigs/${c.id}`))}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
        <div className="fixed inset-0 bg-white z-[100] flex flex-col p-6 space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="font-bold text-xl">{editingConfigId ? '編輯規則' : '新增規則'}</h2>
            <button onClick={() => setIsEditingConfig(false)}><X/></button>
          </div>
          <input type="text" placeholder="名稱" value={configForm.name} onChange={e => setConfigForm({...configForm, name:e.target.value})} className="w-full p-4 border rounded-xl" />
          <div className="flex gap-4">
            <input type="text" placeholder="圖示" value={configForm.icon} onChange={e => setConfigForm({...configForm, icon:e.target.value})} className="w-20 p-4 border rounded-xl text-center" />
            <input type="number" placeholder="賞金" value={configForm.price} onChange={e => setConfigForm({...configForm, price:Number(e.target.value)})} className="flex-1 p-4 border rounded-xl" />
          </div>
          <div>每 <input type="number" value={configForm.freq} onChange={e => setConfigForm({...configForm, freq:Number(e.target.value)})} className="w-20 p-2 border rounded-lg text-center" /> 天產生一次</div>
          <button onClick={saveConfig} className="w-full py-4 bg-[#28C8C8] text-white rounded-2xl font-bold">儲存規則</button>
        </div>
      )}
    </div>
  );
}

const History = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
);