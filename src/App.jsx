import React, { useState, useEffect } from 'react';
import liff from '@line/liff';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, update, serverTimestamp, remove } from "firebase/database";
import { 
  Trash2, Wallet, Users, CheckCircle2, Settings, Edit2, X, 
  CalendarDays, ChevronDown, ChevronUp, Check, Loader2, LogOut, Home, Plus, 
  Calendar, ChevronLeft, ChevronRight, AlertCircle, ArrowRightCircle
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
const addDays = (dateStr, days) => {
  const result = new Date(dateStr);
  result.setDate(result.getDate() + days);
  return result.toISOString().split('T')[0];
};
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
  
  // 顯示更多控制
  const [showAllMyTasks, setShowAllMyTasks] = useState(false);
  const [showAllTaskList, setShowAllTaskList] = useState(false);
  const TASKS_LIMIT = 3;

  // Calendar State
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(getTodayString());

  // Modals
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [showConfirmGenModal, setShowConfirmGenModal] = useState(false);
  const [pendingConfigId, setPendingConfigId] = useState(null);
  const [alertMsg, setAlertMsg] = useState(null);
  
  // Delete Confirm Modal
  const [deleteTarget, setDeleteTarget] = useState(null); // { type: 'config' | 'roomie', id: string }

  // Smart Settlement Modal
  const [showSettlementModal, setShowSettlementModal] = useState(false);

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
    await remove(ref(db, `groups/${groupId}/users/${currentUser.id}`));
    const newGroups = myGroups.filter(g => g.id !== groupId);
    localStorage.setItem('roomie_groups', JSON.stringify(newGroups));
    setMyGroups(newGroups);
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
  const completeTask = async (task) => {
    await update(ref(db, `groups/${groupId}/tasks/${task.id}`), { status: 'done' });
    // 日誌記錄
    const logId = Date.now();
    set(ref(db, `groups/${groupId}/logs/${logId}`), { id: logId, msg: `✅ ${currentUser.name} 完成了 ${task.name}`, type: 'success', time: new Date().toLocaleTimeString() });
  };
  
  const releaseTask = async (task) => {
    const myBal = users.find(u => u.id === currentUser.id)?.balance || 0;
    update(ref(db, `groups/${groupId}/users/${currentUser.id}`), { balance: myBal - (task.price || 0) });
    update(ref(db, `groups/${groupId}/tasks/${task.id}`), { status: 'open', currentHolderId: null });
    // 日誌記錄
    const logId = Date.now();
    set(ref(db, `groups/${groupId}/logs/${logId}`), { id: logId, msg: `💸 ${currentUser.name} 釋出 ${task.name} (賞金${task.price})`, type: 'warning', time: new Date().toLocaleTimeString() });
  };

  const claimTask = async (task) => {
    const myBal = users.find(u => u.id === currentUser.id)?.balance || 0;
    update(ref(db, `groups/${groupId}/users/${currentUser.id}`), { balance: myBal + (task.price || 0) });
    update(ref(db, `groups/${groupId}/tasks/${task.id}`), { status: 'pending', currentHolderId: currentUser.id });
    // 日誌記錄
    const logId = Date.now();
    set(ref(db, `groups/${groupId}/logs/${logId}`), { id: logId, msg: `💰 ${currentUser.name} 接手了 ${task.name}`, type: 'success', time: new Date().toLocaleTimeString() });
  };

  const saveConfig = async () => {
    if (configForm.price <= 0 || configForm.freq <= 0) {
      setAlertMsg("金額與頻率必須大於 0");
      return;
    }
    const id = editingConfigId || `cfg-${generateId()}`;
    const freqStr = typeof configForm.freq === 'string' ? configForm.freq : `每 ${configForm.freq} 天`;
    const assignee = configForm.defaultAssigneeId || currentUser.id;
    const configData = { ...configForm, id, freq: freqStr, defaultAssigneeId: assignee };
    
    await update(ref(db, `groups/${groupId}/taskConfigs/${id}`), { ...configData });
    setIsEditingConfig(false);

    if (!editingConfigId) {
      setPendingConfigId(id);
      setShowConfirmGenModal(true);
    }
  };

  const deleteConfigConfirm = async () => {
    if (deleteTarget && deleteTarget.type === 'config') {
       await remove(ref(db, `groups/${groupId}/taskConfigs/${deleteTarget.id}`));
       setDeleteTarget(null);
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

  // 智慧還款邏輯
  const calculateSettlements = () => {
    let debtors = users.filter(u => u.balance < 0).sort((a,b) => a.balance - b.balance);
    let creditors = users.filter(u => u.balance > 0).sort((a,b) => b.balance - a.balance);
    let transactions = [];
    
    let dIndex = 0, cIndex = 0;
    while(dIndex < debtors.length && cIndex < creditors.length){
      let debtor = debtors[dIndex];
      let creditor = creditors[cIndex];
      let amount = Math.min(Math.abs(debtor.balance), creditor.balance);
      
      if(amount > 0) {
        transactions.push({ from: debtor.name, to: creditor.name, amount: amount, fromId: debtor.id, toId: creditor.id });
      }

      debtor.balance += amount;
      creditor.balance -= amount;

      if(Math.abs(debtor.balance) < 0.1) dIndex++;
      if(creditor.balance < 0.1) cIndex++;
    }
    return transactions;
  };

  const settleUp = async (tx) => {
    const updates = {};
    const fromUser = users.find(u => u.id === tx.fromId);
    const toUser = users.find(u => u.id === tx.toId);
    
    // 更新餘額
    updates[`groups/${groupId}/users/${tx.fromId}/balance`] = fromUser.balance + tx.amount;
    updates[`groups/${groupId}/users/${tx.toId}/balance`] = toUser.balance - tx.amount;
    
    // 記錄 log
    const logId = Date.now();
    updates[`groups/${groupId}/logs/${logId}`] = { 
      id: logId, 
      msg: `💸 ${tx.from} 支付了 $${tx.amount} 給 ${tx.to} (已結清)`, 
      type: 'info', 
      time: new Date().toLocaleTimeString() 
    };

    await update(ref(db), updates);
    setAlertMsg(`已將 ${tx.from} 與 ${tx.to} 的該筆帳務結清！`);
    setShowSettlementModal(false);
  };

  // 45天過濾器
  const limitDate = addDays(getTodayString(), 45);
  const filterDateRange = (tasks) => tasks.filter(t => t.date >= getTodayString() && t.date <= limitDate);
  const myTasks = filterDateRange(currentCycleTasks.filter(t => t.currentHolderId === currentUser?.id && t.status === 'pending'));
  const allTasks = filterDateRange(currentCycleTasks);

  // UI
  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[#28C8C8]"/></div>;

  // 1️⃣ Landing Page
  if (viewState === 'landing') return (
    <div className="max-w-md mx-auto h-screen flex flex-col p-8 bg-white relative">
      <div className="flex-1">
        <h1 className="text-3xl font-bold mb-2">👋 嗨，{currentUser?.name}</h1>
        <p className="text-gray-500 mb-8">歡迎回到家事交易所</p>
        
        <h3 className="font-bold text-gray-800 mb-4 text-base">已加入的空間</h3>
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
      <button onClick={() => { setNewGroupName(`${currentUser?.name} 的家`); setShowCreateGroupModal(true); }} className="w-full py-4 bg-[#28C8C8] text-white rounded-2xl font-bold shadow-xl shadow-[#28C8C8]/30 active:scale-95 transition-all text-lg">建立新空間</button>

      {showCreateGroupModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 animate-in zoom-in-95">
            <h3 className="text-xl font-bold mb-4 text-center">建立新空間</h3>
            <input type="text" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="輸入空間名稱" className="w-full p-4 bg-gray-50 rounded-xl mb-6 text-center font-bold text-lg"/>
            <div className="flex gap-3">
              <button onClick={() => setShowCreateGroupModal(false)} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-xl font-bold">取消</button>
              <button onClick={handleCreateGroupConfirm} className="flex-1 py-3 bg-[#28C8C8] text-white rounded-xl font-bold">建立</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-md mx-auto h-screen bg-gray-50 flex flex-col overflow-hidden relative">
      <header className="bg-white p-4 border-b flex justify-between items-center z-20">
        <h1 className="font-bold text-lg text-gray-800">{groupName}</h1>
        <div className="relative">
          <div onClick={(e) => { e.stopPropagation(); setIsUserMenuOpen(!isUserMenuOpen); }} className="flex items-center gap-2 bg-gray-100 p-1 pr-3 rounded-full cursor-pointer">
            <img src={currentUser?.avatar} className="w-8 h-8 rounded-full border border-white" />
            <span className="text-sm font-bold text-gray-700">{currentUser?.name}</span>
          </div>
          {isUserMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white border rounded-xl shadow-xl z-50 overflow-hidden animate-in slide-in-from-top-2">
               <button onClick={() => { setViewState('landing'); setGroupId(null); window.history.pushState({}, '', window.location.pathname); }} className="w-full text-left p-4 text-base border-b flex items-center gap-3 hover:bg-gray-50 font-bold text-gray-600"><Home size={18}/> 我的空間 (切換)</button>
               <button onClick={handleQuitGroup} className="w-full text-left p-4 text-base text-red-500 flex items-center gap-3 hover:bg-gray-50 font-bold"><LogOut size={18}/> 退出群組</button>
            </div>
          )}
        </div>
      </header>
      {/* 點擊任意處關閉選單 */}
      {isUserMenuOpen && <div className="fixed inset-0 z-40" onClick={() => setIsUserMenuOpen(false)}></div>}

      <main className="flex-1 overflow-y-auto p-4 pb-24">
        {view === 'roster' && (
          <div className="space-y-6">
            <div className="flex bg-gray-200 p-1 rounded-xl">
              <button onClick={() => setRosterViewMode('list')} className={`flex-1 py-3 rounded-lg text-base font-bold transition-all ${rosterViewMode === 'list' ? 'bg-white text-[#28C8C8] shadow-sm' : 'text-gray-500'}`}>清單</button>
              <button onClick={() => setRosterViewMode('calendar')} className={`flex-1 py-3 rounded-lg text-base font-bold transition-all ${rosterViewMode === 'calendar' ? 'bg-white text-[#28C8C8] shadow-sm' : 'text-gray-500'}`}>日曆</button>
            </div>

            {rosterViewMode === 'list' ? (
              <>
                <section>
                  <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-3 text-lg"><CheckCircle2 size={20} className="text-[#28C8C8]"/> 我的待辦 (近45天)</h3>
                  <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    {myTasks.length === 0 ? 
                      <div className="p-8 text-center text-gray-400 text-base">目前沒有任務 🎉</div> :
                      (showAllMyTasks ? myTasks : myTasks.slice(0, TASKS_LIMIT)).map(task => (
                        <div key={task.id} className="p-4 flex items-center justify-between border-b last:border-0">
                          <div className="flex items-center gap-3">
                            <span className="text-3xl">{task.icon}</span>
                            <div><div className="font-bold text-base text-gray-800">{task.name}</div><div className="text-sm text-gray-400 font-bold">{task.date}</div></div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => releaseTask(task)} className="bg-red-50 text-red-500 px-4 py-2 rounded-lg text-sm font-bold">沒空</button>
                            <button onClick={() => completeTask(task)} className="bg-[#28C8C8] text-white px-4 py-2 rounded-lg text-sm font-bold">完成</button>
                          </div>
                        </div>
                      ))
                    }
                    {myTasks.length > TASKS_LIMIT && (
                      <div onClick={() => setShowAllMyTasks(!showAllMyTasks)} className="p-3 text-center text-[#28C8C8] font-bold text-sm bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors">
                        {showAllMyTasks ? '收起' : `查看更多 (還有 ${myTasks.length - TASKS_LIMIT} 筆)`}
                      </div>
                    )}
                  </div>
                </section>
                <section>
                   <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-3 text-lg"><Users size={20}/> 任務列表 (近45天)</h3>
                  <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    {allTasks.length === 0 ? <div className="p-8 text-center text-gray-400 text-base">目前沒有任務 🎉</div> :
                      (showAllTaskList ? allTasks : allTasks.slice(0, TASKS_LIMIT)).map(task => {
                        const isOpen = task.status === 'open';
                        const isDone = task.status === 'done';
                        const holder = users.find(u => u.id === task.currentHolderId);
                        return (
                          <div key={task.id} className={`p-4 flex items-center justify-between border-b last:border-0 ${isOpen ? 'bg-red-50' : ''}`}>
                            <div className="flex items-center gap-3">
                              <span className={`text-3xl ${isDone ? 'opacity-30' : ''}`}>{task.icon}</span>
                              <div><div className="font-bold text-base text-gray-800">{task.name} {isOpen && <span className="text-red-500 animate-pulse text-xs font-bold">賞金中</span>}</div><div className="text-sm text-gray-400 font-bold">{task.date} · {holder ? holder.name : '未分配'}</div></div>
                            </div>
                            {isOpen && <button onClick={() => claimTask(task)} className="bg-red-500 text-white px-3 py-2 rounded-lg text-sm font-bold">接單 +${task.price}</button>}
                            {isDone && <CheckCircle2 className="text-green-300" size={24}/>}
                          </div>
                        )
                      })
                    }
                    {allTasks.length > TASKS_LIMIT && (
                      <div onClick={() => setShowAllTaskList(!showAllTaskList)} className="p-3 text-center text-[#28C8C8] font-bold text-sm bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors">
                        {showAllTaskList ? '收起' : `查看更多 (還有 ${allTasks.length - TASKS_LIMIT} 筆)`}
                      </div>
                    )}
                  </div>
                </section>
              </>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border p-4">
                <div className="flex justify-between mb-4 items-center font-bold text-gray-700 text-lg">
                  <button onClick={() => setCalendarMonth(new Date(calendarMonth.setMonth(calendarMonth.getMonth() - 1)))} className="p-2 hover:bg-gray-100 rounded-full"><ChevronLeft size={24}/></button>
                  {calendarMonth.getFullYear()} 年 {calendarMonth.getMonth() + 1} 月
                  <button onClick={() => setCalendarMonth(new Date(calendarMonth.setMonth(calendarMonth.getMonth() + 1)))} className="p-2 hover:bg-gray-100 rounded-full"><ChevronRight size={24}/></button>
                </div>
                <div className="grid grid-cols-7 text-center mb-2">
                   {['日','一','二','三','四','五','六'].map(d => <div key={d} className="text-sm font-bold text-gray-400">{d}</div>)}
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
                       <div key={i} onClick={() => setCalendarSelectedDate(dStr)} className={`aspect-square flex flex-col items-center justify-center rounded-lg text-base font-bold relative cursor-pointer ${isSelected ? 'bg-[#28C8C8] text-white' : 'hover:bg-gray-50 text-gray-700'}`}>
                         {day}
                         {hasTask && !isSelected && <div className="w-1.5 h-1.5 bg-red-400 rounded-full mt-1"></div>}
                       </div>
                     )
                   })}
                </div>
                <div className="mt-4 pt-4 border-t">
                  <h4 className="font-bold text-gray-800 text-base mb-3">{calendarSelectedDate} 的任務</h4>
                  {currentCycleTasks.filter(t => t.date === calendarSelectedDate).length === 0 ? <p className="text-sm text-gray-400">當天無任務</p> : 
                    currentCycleTasks.filter(t => t.date === calendarSelectedDate).map(t => (
                      <div key={t.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl mb-2">
                         <div className="flex items-center gap-3"><span className="text-2xl">{t.icon}</span><span className="text-base font-bold text-gray-700">{t.name}</span></div>
                         {t.status === 'done' ? <CheckCircle2 size={20} className="text-green-400"/> : <span className="text-xs font-bold text-gray-400">未完成</span>}
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'wallet' && (
          <div className="space-y-6">
            <div className="bg-[#28C8C8] p-8 rounded-3xl text-white shadow-lg shadow-[#28C8C8]/30">
              <div className="text-sm opacity-80 mb-1">我的淨額</div>
              <div className="text-4xl font-bold font-mono tracking-tight">${users.find(u => u.id === currentUser?.id)?.balance || 0}</div>
            </div>
            
            <button onClick={() => setShowSettlementModal(true)} className="w-full py-4 bg-white border-2 border-[#28C8C8] text-[#28C8C8] rounded-2xl font-bold text-lg flex items-center justify-center gap-2 shadow-sm active:bg-gray-50">
              <Wallet size={20}/> 智慧還款建議
            </button>

            <div className="bg-white rounded-2xl border divide-y">
               {users.map(u => (
                 <div key={u.id} className="p-5 flex justify-between items-center">
                   <div className="flex items-center gap-4"><img src={u.avatar} className="w-10 h-10 rounded-full"/><span className="font-bold text-base text-gray-800">{u.name}</span></div>
                   <span className={`font-bold font-mono text-xl ${u.balance >= 0 ? 'text-[#28C8C8]' : 'text-red-500'}`}>{u.balance >= 0 ? '+' : ''}{u.balance}</span>
                 </div>
               ))}
            </div>
          </div>
        )}

        {view === 'history' && (
          <div className="space-y-4 pl-4 border-l-2 border-gray-100 ml-2">
            {logs.map(log => (
              <div key={log.id} className="relative pb-6">
                <div className={`absolute -left-[23px] top-1 w-3 h-3 rounded-full border-2 border-white ${log.type === 'success' ? 'bg-green-500' : log.type === 'warning' ? 'bg-red-500' : 'bg-[#28C8C8]'}`}></div>
                <div className="text-base text-gray-800 font-bold">{log.msg}</div>
                <div className="text-xs text-gray-400 font-bold mt-1">{log.time}</div>
              </div>
            ))}
          </div>
        )}

        {view === 'settings' && (
          <div className="space-y-6">
            <div className="bg-white p-5 rounded-2xl border shadow-sm">
               <div className="flex justify-between items-center mb-4 border-b pb-2">
                 <h3 className="font-bold text-gray-800 text-lg">室友列表</h3>
                 <button onClick={async () => {
                   const link = `https://liff.line.me/${LIFF_ID}?g=${groupId}`;
                   if (liff.isApiAvailable('shareTargetPicker')) await liff.shareTargetPicker([{ type: "text", text: `🏠 加入我的家事空間：\n${link}` }]);
                   else { navigator.clipboard.writeText(link); setAlertMsg("連結已複製"); }
                 }} className="bg-[#28C8C8] text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md">發送邀請</button>
               </div>
               <div className="space-y-3">
                 {users.map(u => (
                   <div key={u.id} className="flex items-center gap-3">
                     <img src={u.avatar} className="w-10 h-10 rounded-full border border-gray-100"/>
                     <span className="font-bold text-base text-gray-700">{u.name}</span>
                   </div>
                 ))}
               </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <h3 className="font-bold text-gray-800 text-lg">家事規則</h3>
                <button onClick={() => { setEditingConfigId(null); setConfigForm({ name: '', price: 30, freq: 7, icon: '🧹', defaultAssigneeId: currentUser.id, nextDate: getTodayString() }); setIsEditingConfig(true); }} className="text-[#28C8C8] text-sm font-bold flex items-center gap-1"><Plus size={18}/> 新增</button>
              </div>
              <div className="space-y-3">
                {taskConfigs.map(c => (
                  <div key={c.id} className="flex justify-between items-center p-4 bg-white border rounded-xl shadow-sm">
                    <div className="flex items-center gap-4"><span className="text-3xl">{c.icon}</span><div className="font-bold text-base text-gray-800">{c.name}</div></div>
                    <div className="flex gap-4">
                      <Edit2 size={20} className="text-blue-400 hover:text-blue-600 cursor-pointer" onClick={() => { 
                         setEditingConfigId(c.id); 
                         const freqNum = c.freq && typeof c.freq === 'string' ? parseInt(c.freq.match(/\d+/)?.[0] || '7') : 7;
                         setConfigForm({ ...c, freq: freqNum, nextDate: c.nextDate || getTodayString() }); 
                         setIsEditingConfig(true); 
                      }}/>
                      <Trash2 size={20} className="text-red-400 hover:text-red-600 cursor-pointer" onClick={() => setDeleteTarget({ type: 'config', id: c.id })}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Nav */}
      <nav className="bg-white border-t flex justify-around pb-8 pt-3">
        {[{id:'roster', icon:CalendarDays, label:'值日表'}, {id:'wallet', icon:Wallet, label:'帳本'}, {id:'history', icon:Loader2, label:'動態'}, {id:'settings', icon:Settings, label:'設定'}].map(n => (
          <button key={n.id} onClick={() => setView(n.id)} className={`flex flex-col items-center w-full py-2 ${view === n.id ? 'text-[#28C8C8]' : 'text-gray-400'}`}><n.icon size={26}/><span className="text-xs font-bold mt-1">{n.label}</span></button>
        ))}
      </nav>

      {/* --- Modals --- */}
      
      {/* Smart Settlement Modal */}
      {showSettlementModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex flex-col justify-end sm:justify-center p-4" onClick={() => setShowSettlementModal(false)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 animate-in slide-in-from-bottom-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-xl mb-4 text-center">智慧還款建議 (V1)</h3>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto mb-4">
              {calculateSettlements().length === 0 ? <p className="text-center text-gray-400 py-4">目前沒有需要結算的帳務</p> :
               calculateSettlements().map((tx, idx) => (
                 <div key={idx} className="bg-gray-50 p-4 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2 text-base font-bold text-gray-700">
                      <span>{tx.from}</span>
                      <ArrowRightCircle size={16} className="text-gray-400"/>
                      <span>{tx.to}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-lg">${tx.amount}</span>
                      <button onClick={() => settleUp(tx)} className="bg-[#28C8C8] text-white px-3 py-1 rounded-lg text-xs font-bold">已還清</button>
                    </div>
                 </div>
               ))
              }
            </div>
            <button onClick={() => setShowSettlementModal(false)} className="w-full py-3 bg-gray-100 font-bold rounded-xl text-gray-600">關閉</button>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 text-center animate-in zoom-in-95">
             <div className="mb-4 text-red-500 flex justify-center"><AlertCircle size={48}/></div>
             <h3 className="font-bold text-xl mb-2 text-gray-800">確定刪除？</h3>
             <p className="text-gray-500 mb-6 text-sm">此動作無法復原，請確認是否執行。</p>
             <div className="flex gap-3">
               <button onClick={() => setDeleteTarget(null)} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-xl font-bold">取消</button>
               <button onClick={deleteConfigConfirm} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold">刪除</button>
             </div>
          </div>
        </div>
      )}

      {/* Edit Config Modal */}
      {isEditingConfig && (
        <div className="fixed inset-0 bg-black/60 z-50 flex flex-col justify-end sm:justify-center">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 space-y-6 animate-in slide-in-from-bottom-5">
            <div className="flex justify-between items-center border-b pb-4">
              <h2 className="font-bold text-xl">{editingConfigId ? '編輯家事' : '新增家事'}</h2>
              <button onClick={() => setIsEditingConfig(false)} className="p-2 bg-gray-100 rounded-full"><X size={24}/></button>
            </div>
            
            <div className="flex gap-4">
              <input type="text" placeholder="🧹" value={configForm.icon} onChange={e => setConfigForm({...configForm, icon:e.target.value})} className="w-20 p-4 bg-gray-50 rounded-2xl text-center text-3xl outline-none focus:ring-2 focus:ring-[#28C8C8]"/>
              <input type="text" placeholder="名稱 (如：倒垃圾)" value={configForm.name} onChange={e => setConfigForm({...configForm, name:e.target.value})} className="flex-1 p-4 bg-gray-50 rounded-2xl text-lg font-bold outline-none focus:ring-2 focus:ring-[#28C8C8]"/>
            </div>

            <div className="relative">
              <input type="number" value={configForm.price === 0 ? '' : configForm.price} onChange={e => setConfigForm({...configForm, price: e.target.value === '' ? 0 : Number(e.target.value)})} className="w-full p-4 bg-gray-50 rounded-2xl font-mono text-xl font-bold outline-none focus:ring-2 focus:ring-[#28C8C8]"/>
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">元</span>
            </div>

            <div className="relative">
              <input type="number" value={configForm.freq === 0 ? '' : configForm.freq} onChange={e => setConfigForm({...configForm, freq: e.target.value === '' ? 0 : Number(e.target.value)})} className="w-full p-4 bg-gray-50 rounded-2xl font-mono text-xl font-bold outline-none focus:ring-2 focus:ring-[#28C8C8] text-center"/>
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">每</span>
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">日一次</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-bold text-gray-400 ml-1">何時開始</label>
                <input type="date" value={configForm.nextDate} onChange={e => setConfigForm({...configForm, nextDate:e.target.value})} className="w-full h-[60px] px-3 bg-gray-50 rounded-2xl font-bold outline-none text-base"/>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-bold text-gray-400 ml-1">由誰開始</label>
                <select value={configForm.defaultAssigneeId} onChange={e => setConfigForm({...configForm, defaultAssigneeId:e.target.value})} className="w-full h-[60px] px-3 bg-gray-50 rounded-2xl font-bold outline-none appearance-none text-base">
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>

            <button onClick={saveConfig} className="w-full py-5 bg-[#28C8C8] text-white rounded-2xl font-bold text-xl shadow-xl shadow-[#28C8C8]/20 active:scale-95 transition-transform">儲存家事</button>
          </div>
        </div>
      )}

      {/* 產生任務確認 & 通用 Alert */}
      {showConfirmGenModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 animate-in zoom-in-95 text-center">
            <h3 className="text-xl font-bold mb-2">規則已儲存！</h3>
            <p className="text-gray-500 mb-6 text-base">是否要立即產生第一筆任務到值日表？</p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirmGenModal(false)} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-xl font-bold">不用</button>
              <button onClick={confirmGenerateTask} className="flex-1 py-3 bg-[#28C8C8] text-white rounded-xl font-bold">立即產生</button>
            </div>
          </div>
        </div>
      )}

      {alertMsg && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-6" onClick={() => setAlertMsg(null)}>
          <div className="bg-white w-full max-w-xs rounded-3xl p-6 animate-in zoom-in-95 text-center" onClick={e => e.stopPropagation()}>
            <div className="mb-4 text-[#28C8C8] flex justify-center"><CheckCircle2 size={40}/></div>
            <h3 className="font-bold text-gray-800 mb-6 text-lg">{alertMsg}</h3>
            <button onClick={() => setAlertMsg(null)} className="w-full py-3 bg-gray-100 rounded-xl font-bold text-gray-600">好</button>
          </div>
        </div>
      )}
    </div>
  );
}