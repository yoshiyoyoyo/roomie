import React, { useState, useEffect } from 'react';
import liff from '@line/liff';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, update, serverTimestamp, remove } from "firebase/database";
import { 
  Trash2, Wallet, Users, CheckCircle2, Settings, Edit2, X, 
  CalendarDays, ChevronDown, ChevronUp, Check, Loader2, LogOut, Plus, Calendar, ChevronLeft, ChevronRight
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

// 工具函式
const getTodayString = () => new Date().toISOString().split('T')[0];
const generateId = () => Math.random().toString(36).substr(2, 9);
const getSavedGroups = () => {
  try { return JSON.parse(localStorage.getItem('roomie_groups') || '[]'); } catch (e) { return []; }
};

// 日曆工具
const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay(); 

export default function RoomieTaskApp() {
  const [loading, setLoading] = useState(true);
  const [viewState, setViewState] = useState('landing'); 
  const [groupId, setGroupId] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  
  // Data
  const [users, setUsers] = useState([]);
  const [taskConfigs, setTaskConfigs] = useState([]);
  const [currentCycleTasks, setCurrentCycleTasks] = useState([]);
  const [logs, setLogs] = useState([]);
  const [myGroups, setMyGroups] = useState([]);

  // UI Views
  const [view, setView] = useState('roster');
  const [rosterViewMode, setRosterViewMode] = useState('list');
  const [isMyTasksOpen, setIsMyTasksOpen] = useState(true);
  const [isTaskListOpen, setIsTaskListOpen] = useState(true);

  // Calendar State
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(getTodayString());

  // Modals
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [showConfirmGenModal, setShowConfirmGenModal] = useState(false);
  const [pendingConfigId, setPendingConfigId] = useState(null);
  const [alertMsg, setAlertMsg] = useState(null);

  // Config Editor
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState(null);
  const [configForm, setConfigForm] = useState({ 
    name: '', price: 30, freq: 7, icon: '🧹', defaultAssigneeId: '', nextDate: getTodayString() 
  });

  useEffect(() => {
    liff.init({ liffId: LIFF_ID }).then(async () => {
      if (!liff.isLoggedIn()) { liff.login(); return; }
      const profile = await liff.getProfile();
      const user = { id: profile.userId, name: profile.displayName, avatar: profile.pictureUrl };
      setCurrentUser(user);
      setMyGroups(getSavedGroups());

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
        
        // 更新本地紀錄
        const saved = getSavedGroups();
        if (!saved.find(g => g.id === gId)) {
          const updated = [{ id: gId, name: data.metadata?.name || '新空間' }, ...saved].slice(0, 10);
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
    const logId = Date.now();
    set(ref(db, `groups/${gId}/logs/${logId}`), { id: logId, msg: `👋 ${user.name} 加入了空間`, type: 'success', time: new Date().toLocaleTimeString() });
  };

  const handleQuitGroup = async () => {
    if (!confirm("確定要退出此空間嗎？您將會從成員名單中移除。")) return;
    
    // 1. 從 Firebase 移除成員
    await remove(ref(db, `groups/${groupId}/users/${currentUser.id}`));
    
    // 2. 從本地列表移除
    const newGroups = myGroups.filter(g => g.id !== groupId);
    localStorage.setItem('roomie_groups', JSON.stringify(newGroups));
    setMyGroups(newGroups);

    // 3. 回首頁
    setGroupId(null);
    setViewState('landing');
    window.history.pushState({}, '', window.location.pathname);
  };

  const handleCreateGroupConfirm = async () => {
    if (!newGroupName.trim()) return;
    setLoading(true);
    const gid = `rm-${generateId()}`;
    await set(ref(db, `groups/${gid}`), { 
        metadata: { name: newGroupName, createdAt: serverTimestamp() }, 
        users: { [currentUser.id]: { ...currentUser, balance: 0 } },
        logs: { [Date.now()]: { id: Date.now(), msg: `🏠 空間「${newGroupName}」已建立`, type: 'info', time: new Date().toLocaleTimeString() } } 
    });
    setShowCreateGroupModal(false);
    window.location.href = `https://liff.line.me/${LIFF_ID}?g=${gid}`;
  };

  // 任務邏輯
  const completeTask = async (task) => update(ref(db, `groups/${groupId}/tasks/${task.id}`), { status: 'done' });
  
  const releaseTask = async (task) => {
    const myBal = users.find(u => u.id === currentUser.id)?.balance || 0;
    update(ref(db, `groups/${groupId}/users/${currentUser.id}`), { balance: myBal - (task.price || 0) });
    update(ref(db, `groups/${groupId}/tasks/${task.id}`), { status: 'open', currentHolderId: null });
  };

  const claimTask = async (task) => {
    const myBal = users.find(u => u.id === currentUser.id)?.balance || 0;
    update(ref(db, `groups/${groupId}/users/${currentUser.id}`), { balance: myBal + (task.price || 0) });
    update(ref(db, `groups/${groupId}/tasks/${task.id}`), { status: 'pending', currentHolderId: currentUser.id });
  };

  const saveConfig = async () => {
    const id = editingConfigId || `cfg-${generateId()}`;
    const freqStr = typeof configForm.freq === 'string' ? configForm.freq : `每 ${configForm.freq} 天`;
    const assignee = configForm.defaultAssigneeId || currentUser.id;
    const configData = { ...configForm, id, freq: freqStr, defaultAssigneeId: assignee };
    
    await update(ref(db), { [`groups/${groupId}/taskConfigs/${id}`]: configData });
    setIsEditingConfig(false);

    if (!editingConfigId) {
      setPendingConfigId(id);
      setShowConfirmGenModal(true);
    }
  };

  const confirmGenerateTask = async () => {
    if (!pendingConfigId) return;
    const tid = `task-${generateId()}`;
    const assignee = configForm.defaultAssigneeId || currentUser.id;
    await set(ref(db, `groups/${groupId}/tasks/${tid}`), { 
      ...configForm, id: tid, date: configForm.nextDate || getTodayString(), status: 'pending', currentHolderId: assignee 
    });
    setShowConfirmGenModal(false);
    setAlertMsg("已產生任務！");
  };

  // UI Component
  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[#28C8C8]"/></div>;

  // 1️⃣ Landing Page
  if (viewState === 'landing') return (
    <div className="max-w-md mx-auto h-screen flex flex-col p-8 bg-white relative">
      <div className="flex-1">
        <h1 className="text-3xl font-bold mb-2">👋 嗨，{currentUser?.name}</h1>
        <p className="text-gray-500 mb-8">歡迎回到家事交易所</p>
        
        <h3 className="font-bold text-gray-800 mb-4 text-sm">已加入的空間</h3>
        <div className="space-y-4">
          {myGroups.length === 0 ? (
            <div className="text-center py-10 text-gray-300 border-2 border-dashed rounded-2xl text-sm">還沒加入任何空間</div>
          ) : (
            myGroups.map(g => (
              <div key={g.id} onClick={() => enterGroup(g.id, currentUser)} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center active:scale-95 transition-all cursor-pointer">
                <span className="font-bold text-gray-700 text-base">{g.name}</span>
                <div className="text-[#28C8C8] font-bold text-base">進入</div>
              </div>
            ))
          )}
        </div>
      </div>
      <button onClick={() => { setNewGroupName(`${currentUser?.name} 的家`); setShowCreateGroupModal(true); }} className="w-full py-4 bg-[#28C8C8] text-white rounded-2xl font-bold shadow-xl shadow-[#28C8C8]/30 active:scale-95 transition-all">建立新空間</button>

      {showCreateGroupModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 animate-in zoom-in-95">
            <h3 className="text-xl font-bold mb-4 text-center">建立新空間</h3>
            <input type="text" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="輸入空間名稱" className="w-full p-4 bg-gray-50 rounded-xl mb-6 text-center font-bold"/>
            <div className="flex gap-3">
              <button onClick={() => setShowCreateGroupModal(false)} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-xl font-bold">取消</button>
              <button onClick={handleCreateGroupConfirm} className="flex-1 py-3 bg-[#28C8C8] text-white rounded-xl font-bold">建立</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // 2️⃣ App Main
  return (
    <div className="max-w-md mx-auto h-screen bg-gray-50 flex flex-col overflow-hidden relative">
      <header className="bg-white p-4 border-b flex justify-between items-center z-20">
        <h1 className="font-bold text-lg text-gray-800">{groupName}</h1>
        <div className="relative">
          <div onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="flex items-center gap-2 bg-gray-100 p-1 pr-3 rounded-full cursor-pointer">
            <img src={currentUser?.avatar} className="w-8 h-8 rounded-full border border-white" />
            <span className="text-xs font-bold text-gray-700">{currentUser?.name}</span>
          </div>
          {isUserMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white border rounded-xl shadow-xl z-50 overflow-hidden animate-in slide-in-from-top-2">
               <button onClick={() => { setViewState('landing'); setGroupId(null); window.history.pushState({}, '', window.location.pathname); }} className="w-full text-left p-4 text-sm border-b flex items-center gap-3 hover:bg-gray-50 font-bold text-gray-600"><Home size={16}/> 我的空間 (切換)</button>
               <button onClick={handleQuitGroup} className="w-full text-left p-4 text-sm text-red-500 flex items-center gap-3 hover:bg-gray-50 font-bold"><LogOut size={16}/> 退出目前空間</button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-24">
        {view === 'roster' && (
          <div className="space-y-6">
            <div className="flex bg-gray-200 p-1 rounded-xl">
              <button onClick={() => setRosterViewMode('list')} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${rosterViewMode === 'list' ? 'bg-white text-[#28C8C8] shadow-sm' : 'text-gray-500'}`}>清單</button>
              <button onClick={() => setRosterViewMode('calendar')} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${rosterViewMode === 'calendar' ? 'bg-white text-[#28C8C8] shadow-sm' : 'text-gray-500'}`}>日曆</button>
            </div>

            {rosterViewMode === 'list' ? (
              <>
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
                      {currentCycleTasks.length === 0 ? <div className="p-8 text-center text-gray-400 text-sm">目前沒有任務 🎉</div> :
                        currentCycleTasks.map(task => {
                          const isOpen = task.status === 'open';
                          const isDone = task.status === 'done';
                          return (
                            <div key={task.id} className={`p-4 flex items-center justify-between border-b last:border-0 ${isOpen ? 'bg-red-50' : ''}`}>
                              <div className="flex items-center gap-3">
                                <span className={`text-2xl ${isDone ? 'opacity-30' : ''}`}>{task.icon}</span>
                                <div><div className="font-bold text-sm">{task.name} {isOpen && <span className="text-red-500 animate-pulse text-[10px]">賞金中</span>}</div><div className="text-[10px] text-gray-400">{task.date}</div></div>
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
              </>
            ) : (
              // 日曆視圖 (回歸版)
              <div className="bg-white rounded-2xl shadow-sm border p-4">
                <div className="flex justify-between mb-4 items-center font-bold text-gray-700">
                  <button onClick={() => setCalendarMonth(new Date(calendarMonth.setMonth(calendarMonth.getMonth() - 1)))} className="p-2 hover:bg-gray-100 rounded-full"><ChevronLeft size={20}/></button>
                  {calendarMonth.getFullYear()} 年 {calendarMonth.getMonth() + 1} 月
                  <button onClick={() => setCalendarMonth(new Date(calendarMonth.setMonth(calendarMonth.getMonth() + 1)))} className="p-2 hover:bg-gray-100 rounded-full"><ChevronRight size={20}/></button>
                </div>
                <div className="grid grid-cols-7 text-center mb-2">
                   {['日','一','二','三','四','五','六'].map(d => <div key={d} className="text-xs font-bold text-gray-400">{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                   {Array.from({ length: getDaysInMonth(calendarMonth.getFullYear(), calendarMonth.getMonth()) + getFirstDayOfMonth(calendarMonth.getFullYear(), calendarMonth.getMonth()) }).map((_, i) => {
                     const first = getFirstDayOfMonth(calendarMonth.getFullYear(), calendarMonth.getMonth());
                     if (i < first) return <div key={i} className="aspect-square"/>;
                     const day = i - first + 1;
                     const dStr = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                     const hasTask = currentCycleTasks.some(t => t.date === dStr && t.status !== 'done');
                     const isSelected = dStr === calendarSelectedDate;
                     return (
                       <div key={i} onClick={() => setCalendarSelectedDate(dStr)} className={`aspect-square flex flex-col items-center justify-center rounded-lg text-sm font-bold relative cursor-pointer ${isSelected ? 'bg-[#28C8C8] text-white' : 'hover:bg-gray-50 text-gray-700'}`}>
                         {day}
                         {hasTask && !isSelected && <div className="w-1.5 h-1.5 bg-red-400 rounded-full mt-1"></div>}
                       </div>
                     )
                   })}
                </div>
                <div className="mt-4 pt-4 border-t">
                  <h4 className="font-bold text-gray-800 text-sm mb-2">{calendarSelectedDate} 的任務</h4>
                  {currentCycleTasks.filter(t => t.date === calendarSelectedDate).length === 0 ? <p className="text-xs text-gray-400">當天無任務</p> : 
                    currentCycleTasks.filter(t => t.date === calendarSelectedDate).map(t => (
                      <div key={t.id} className="flex items-center gap-2 py-1"><span className="text-lg">{t.icon}</span><span className="text-sm text-gray-700">{t.name}</span>{t.status === 'done' && <CheckCircle2 size={14} className="text-green-400"/>}</div>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'wallet' && (
          <div className="space-y-4">
            <div className="bg-[#28C8C8] p-6 rounded-2xl text-white shadow-lg shadow-[#28C8C8]/30">
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
            <div className="bg-white p-4 rounded-xl border flex justify-between items-center shadow-sm">
               <div className="flex -space-x-2 overflow-hidden">
                 {users.map(u => <img key={u.id} src={u.avatar} className="inline-block h-8 w-8 rounded-full ring-2 ring-white" alt={u.name}/>)}
               </div>
               <button onClick={async () => {
                 const link = `https://liff.line.me/${LIFF_ID}?g=${groupId}`;
                 if (liff.isApiAvailable('shareTargetPicker')) await liff.shareTargetPicker([{ type: "text", text: `🏠 加入我的家事空間：\n${link}` }]);
                 else { navigator.clipboard.writeText(link); setAlertMsg("連結已複製"); }
               }} className="bg-[#28C8C8] text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md">發送邀請</button>
            </div>

            <div className="bg-white p-4 rounded-xl border space-y-4 shadow-sm">
              <div className="flex justify-between items-center">
                <h3 className="font-bold">家事規則</h3>
                <button onClick={() => { setEditingConfigId(null); setConfigForm({ name: '', price: 30, freq: 7, icon: '🧹', defaultAssigneeId: currentUser.id, nextDate: getTodayString() }); setIsEditingConfig(true); }} className="text-[#28C8C8] text-xs font-bold flex items-center gap-1">+ 新增</button>
              </div>
              <div className="space-y-2">
                {taskConfigs.map(c => (
                  <div key={c.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-3"><span className="text-xl">{c.icon}</span><div className="font-bold text-sm">{c.name}</div></div>
                    <div className="flex gap-4">
                      <Edit2 size={16} className="text-gray-300 hover:text-[#28C8C8]" onClick={() => { 
                         setEditingConfigId(c.id); 
                         const freqNum = c.freq && typeof c.freq === 'string' ? parseInt(c.freq.match(/\d+/)?.[0] || '7') : 7;
                         setConfigForm({ ...c, freq: freqNum, nextDate: c.nextDate || getTodayString() }); 
                         setIsEditingConfig(true); 
                      }}/>
                      <Trash2 size={16} className="text-gray-300 hover:text-red-500" onClick={() => remove(ref(db, `groups/${groupId}/taskConfigs/${c.id}`))}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      <nav className="bg-white border-t flex justify-around pb-8 pt-2">
        {[{id:'roster', icon:CalendarDays, label:'值日表'}, {id:'wallet', icon:Wallet, label:'帳本'}, {id:'history', icon:History, label:'動態'}, {id:'settings', icon:Settings, label:'設定'}].map(n => (
          <button key={n.id} onClick={() => setView(n.id)} className={`flex flex-col items-center w-full py-2 ${view === n.id ? 'text-[#28C8C8]' : 'text-gray-400'}`}><n.icon size={22}/><span className="text-[10px] font-bold mt-1">{n.label}</span></button>
        ))}
      </nav>

      {/* 新增/編輯家事彈窗 (高度與樣式優化) */}
      {isEditingConfig && (
        <div className="fixed inset-0 bg-black/60 z-50 flex flex-col justify-end sm:justify-center">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 space-y-5 animate-in slide-in-from-bottom-5">
            <div className="flex justify-between items-center border-b pb-4">
              <h2 className="font-bold text-xl">{editingConfigId ? '編輯家事' : '新增家事'}</h2>
              <button onClick={() => setIsEditingConfig(false)} className="p-2 bg-gray-100 rounded-full"><X size={20}/></button>
            </div>
            
            <div className="flex gap-4">
              <input type="text" placeholder="🧹" value={configForm.icon} onChange={e => setConfigForm({...configForm, icon:e.target.value})} className="w-16 h-14 p-0 text-center bg-gray-50 rounded-2xl text-2xl outline-none focus:ring-2 focus:ring-[#28C8C8]"/>
              <input type="text" placeholder="名稱 (如：倒垃圾)" value={configForm.name} onChange={e => setConfigForm({...configForm, name:e.target.value})} className="flex-1 h-14 px-4 bg-gray-50 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-[#28C8C8]"/>
            </div>

            <div className="relative">
              <input type="number" value={configForm.price} onChange={e => setConfigForm({...configForm, price:Number(e.target.value)})} className="w-full h-14 px-4 bg-gray-50 rounded-2xl font-mono text-xl font-bold outline-none focus:ring-2 focus:ring-[#28C8C8]"/>
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">元</span>
            </div>

            <div className="relative">
              <input type="number" value={configForm.freq} onChange={e => setConfigForm({...configForm, freq:Number(e.target.value)})} className="w-full h-14 px-4 pl-12 bg-gray-50 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-[#28C8C8]"/>
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">每</span>
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">日一次</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 ml-1">何時開始</label>
                <input type="date" value={configForm.nextDate} onChange={e => setConfigForm({...configForm, nextDate:e.target.value})} className="w-full h-14 px-3 bg-gray-50 rounded-2xl font-bold outline-none text-sm"/>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 ml-1">由誰開始</label>
                <select value={configForm.defaultAssigneeId} onChange={e => setConfigForm({...configForm, defaultAssigneeId:e.target.value})} className="w-full h-14 px-3 bg-gray-50 rounded-2xl font-bold outline-none appearance-none text-sm">
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>

            <button onClick={saveConfig} className="w-full py-4 bg-[#28C8C8] text-white rounded-2xl font-bold text-lg shadow-xl shadow-[#28C8C8]/20 active:scale-95 transition-transform">儲存家事</button>
          </div>
        </div>
      )}

      {/* 確認產生任務彈窗 */}
      {showConfirmGenModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 animate-in zoom-in-95 text-center">
            <h3 className="text-xl font-bold mb-2">規則已儲存！</h3>
            <p className="text-gray-500 mb-6 text-sm">是否要立即產生第一筆任務到值日表？</p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirmGenModal(false)} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-xl font-bold">不用</button>
              <button onClick={confirmGenerateTask} className="flex-1 py-3 bg-[#28C8C8] text-white rounded-xl font-bold">立即產生</button>
            </div>
          </div>
        </div>
      )}

      {/* 通用提示 */}
      {alertMsg && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-6" onClick={() => setAlertMsg(null)}>
          <div className="bg-white w-full max-w-xs rounded-3xl p-6 animate-in zoom-in-95 text-center" onClick={e => e.stopPropagation()}>
            <div className="mb-4 text-[#28C8C8] flex justify-center"><CheckCircle2 size={40}/></div>
            <h3 className="font-bold text-gray-800 mb-6">{alertMsg}</h3>
            <button onClick={() => setAlertMsg(null)} className="w-full py-3 bg-gray-100 rounded-xl font-bold text-gray-600">好</button>
          </div>
        </div>
      )}

    </div>
  );
}

const History = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
);