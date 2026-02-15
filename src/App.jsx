import React, { useState, useEffect } from 'react';
import liff from '@line/liff';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, update, serverTimestamp, remove, get } from "firebase/database";
import { 
  Trash2, Wallet, Users, CheckCircle2, Settings, Edit2, X, 
  ChevronDown, ChevronUp, Check, Loader2, LogOut, Home, Plus, 
  ArrowRight, AlertCircle, CalendarDays
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
  const [showAllMyTasks, setShowAllMyTasks] = useState(false);
  const [showAllTaskList, setShowAllTaskList] = useState(false);
  const TASKS_LIMIT = 3;

  // Modals
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [alertMsg, setAlertMsg] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Config Editor
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState(null);
  const [configForm, setConfigForm] = useState({ 
    name: '', price: 30, freq: 7, icon: '🧹', defaultAssigneeId: '', nextDate: getTodayString() 
  });
  const [formError, setFormError] = useState('');

  // ==========================================
  // 🚀 初始化與自動排班
  // ==========================================
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
    
    // 1. 觸發排班檢查 (Check & Generate Future Tasks)
    const snapshot = await get(ref(db, `groups/${gId}`));
    if (snapshot.exists()) {
       const data = snapshot.val();
       await checkAndGenerateTasks(gId, data); 
    }

    // 2. 開啟監聽
    onValue(ref(db, `groups/${gId}`), (snap) => {
      const data = snap.val();
      if (data) {
        setUsers(data.users ? Object.values(data.users) : []);
        setTaskConfigs(data.taskConfigs ? Object.values(data.taskConfigs) : []);
        const tList = data.tasks ? Object.values(data.tasks) : [];
        // 只顯示今天以後 (包含今天) 的任務，或者已過期但未完成的任務
        // 這裡我們簡單做: 顯示所有，然後在 render 層過濾
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

  // 🔥 核心：智慧排班引擎 (輪流 + 未來45天)
  const checkAndGenerateTasks = async (gId, data) => {
    if (!data.taskConfigs || !data.users) return;
    
    const updates = {};
    const configs = Object.values(data.taskConfigs);
    const userIds = Object.keys(data.users); // 取得所有室友 ID 用於輪流
    if (userIds.length === 0) return;

    let hasUpdates = false;
    const limitDate = addDays(getTodayString(), 45); // 預排未來 45 天

    configs.forEach(cfg => {
      let nextDate = cfg.nextDate || getTodayString();
      // 如果下一次執行時間在 45 天內，就產生任務
      while (nextDate <= limitDate) {
        const tid = `task-${generateId()}-${Date.now()}`;
        const freqNum = typeof cfg.freq === 'string' ? parseInt(cfg.freq.match(/\d+/)?.[0] || '7') : cfg.freq;

        // --- 決定負責人 (輪流邏輯) ---
        // 1. 找出上一位負責人 (如果沒有記錄，就用預設)
        let currentAssigneeId = cfg.nextAssigneeId || cfg.defaultAssigneeId || userIds[0];
        
        // 確保這個人還在群組內，不在的話重置為第一位
        if (!userIds.includes(currentAssigneeId)) currentAssigneeId = userIds[0];

        // 2. 建立任務
        updates[`groups/${gId}/tasks/${tid}`] = {
          id: tid,
          configId: cfg.id,
          name: cfg.name,
          price: cfg.price,
          icon: cfg.icon,
          date: nextDate,
          status: 'pending',
          currentHolderId: currentAssigneeId
        };

        // 3. 計算下一位負責人 (Round Robin)
        const currentIndex = userIds.indexOf(currentAssigneeId);
        const nextIndex = (currentIndex + 1) % userIds.length;
        const nextPersonId = userIds[nextIndex];

        // 4. 更新 Config (儲存進度)
        nextDate = addDays(nextDate, freqNum);
        updates[`groups/${gId}/taskConfigs/${cfg.id}/nextDate`] = nextDate;
        updates[`groups/${gId}/taskConfigs/${cfg.id}/nextAssigneeId`] = nextPersonId; // 紀錄下一棒是誰
        
        hasUpdates = true;
      }
    });

    if (hasUpdates) {
      await update(ref(db), updates);
    }
  };

  const registerMember = (gId, user) => {
    update(ref(db, `groups/${gId}/users/${user.id}`), { ...user, balance: 0 });
    const logId = Date.now();
    set(ref(db, `groups/${gId}/logs/${logId}`), { id: logId, msg: `👋 ${user.name} 加入了空間`, type: 'success', time: new Date().toLocaleTimeString() });
  };

  const handleQuitGroup = async () => {
    if (!confirm("確定要退出此空間嗎？您將會從成員名單中移除。")) return;
    
    // 記錄離開日誌
    const logId = Date.now();
    await set(ref(db, `groups/${groupId}/logs/${logId}`), { id: logId, msg: `👋 ${currentUser.name} 離開了空間`, type: 'warning', time: new Date().toLocaleTimeString() });
    
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

  // 任務動作
  const completeTask = async (task) => {
    await update(ref(db, `groups/${groupId}/tasks/${task.id}`), { status: 'done' });
    const logId = Date.now();
    set(ref(db, `groups/${groupId}/logs/${logId}`), { id: logId, msg: `✅ ${currentUser.name} 完成了 ${task.name}`, type: 'success', time: new Date().toLocaleTimeString() });
  };
  
  const releaseTask = async (task) => {
    const myBal = users.find(u => u.id === currentUser.id)?.balance || 0;
    update(ref(db, `groups/${groupId}/users/${currentUser.id}`), { balance: myBal - (task.price || 0) });
    update(ref(db, `groups/${groupId}/tasks/${task.id}`), { status: 'open', currentHolderId: null });
    const logId = Date.now();
    set(ref(db, `groups/${groupId}/logs/${logId}`), { id: logId, msg: `💸 ${currentUser.name} 釋出 ${task.name} (賞金${task.price})`, type: 'warning', time: new Date().toLocaleTimeString() });
  };

  const claimTask = async (task) => {
    const myBal = users.find(u => u.id === currentUser.id)?.balance || 0;
    update(ref(db, `groups/${groupId}/users/${currentUser.id}`), { balance: myBal + (task.price || 0) });
    update(ref(db, `groups/${groupId}/tasks/${task.id}`), { status: 'pending', currentHolderId: currentUser.id });
    const logId = Date.now();
    set(ref(db, `groups/${groupId}/logs/${logId}`), { id: logId, msg: `💰 ${currentUser.name} 接手了 ${task.name}`, type: 'success', time: new Date().toLocaleTimeString() });
  };

  // 規則設定
  const saveConfig = async () => {
    // 表單驗證
    if (!configForm.name.trim()) {
      setFormError("請輸入家事名稱");
      return;
    }
    if (configForm.price <= 0 || configForm.freq <= 0) {
      setFormError("金額與頻率必須大於 0");
      return;
    }
    setFormError('');

    const id = editingConfigId || `cfg-${generateId()}`;
    const freqStr = typeof configForm.freq === 'string' ? configForm.freq : `每 ${configForm.freq} 天`;
    const assignee = configForm.defaultAssigneeId || currentUser.id;
    const configData = { ...configForm, id, freq: freqStr, defaultAssigneeId: assignee };
    
    await update(ref(db, `groups/${groupId}/taskConfigs/${id}`), { ...configData });
    setIsEditingConfig(false);
    
    // 儲存後立即觸發一次補班檢查，讓使用者馬上看到未來的任務
    const snap = await get(ref(db, `groups/${groupId}`));
    await checkAndGenerateTasks(groupId, snap.val());
    setAlertMsg("設定已儲存，並已更新排班！");
  };

  const deleteConfigConfirm = async () => {
    if (deleteTarget && deleteTarget.type === 'config') {
       await remove(ref(db, `groups/${groupId}/taskConfigs/${deleteTarget.id}`));
       // 同時刪除該規則產生的未來待辦 (可選，這裡先保留已產生的任務避免混亂，或者只刪除 pending 的)
       setDeleteTarget(null);
    }
  };

  // 智慧還款邏輯
  const calculateSettlements = () => {
    let balances = users.map(u => ({...u})).filter(u => Math.abs(u.balance) > 0.1);
    let transactions = [];
    let debtors = balances.filter(u => u.balance < 0).sort((a,b) => a.balance - b.balance);
    let creditors = balances.filter(u => u.balance > 0).sort((a,b) => b.balance - a.balance);

    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
       let debtor = debtors[i];
       let creditor = creditors[j];
       let amount = Math.min(Math.abs(debtor.balance), creditor.balance);
       
       if (amount > 0) {
         transactions.push({
           fromId: debtor.id, fromName: debtor.name,
           toId: creditor.id, toName: creditor.name,
           amount: Math.round(amount)
         });
       }
       debtor.balance += amount;
       creditor.balance -= amount;
       if (Math.abs(debtor.balance) < 0.1) i++;
       if (creditor.balance < 0.1) j++;
    }
    return transactions;
  };

  const settleDebt = async (tx) => {
    const fromUser = users.find(u => u.id === tx.fromId);
    const toUser = users.find(u => u.id === tx.toId);
    if (!fromUser || !toUser) return;

    const updates = {};
    updates[`groups/${groupId}/users/${tx.fromId}/balance`] = fromUser.balance + tx.amount;
    updates[`groups/${groupId}/users/${tx.toId}/balance`] = toUser.balance - tx.amount;
    const logId = Date.now();
    updates[`groups/${groupId}/logs/${logId}`] = { 
      id: logId, msg: `💸 ${tx.fromName} 支付了 $${tx.amount} 給 ${tx.toName} (已結清)`, type: 'info', time: new Date().toLocaleTimeString() 
    };
    await update(ref(db), updates);
    setAlertMsg("結帳成功！");
  };

  // 過濾器：今天 ~ 未來45天 (或過期未完成)
  const limitDate = addDays(getTodayString(), 45);
  const visibleTasks = currentCycleTasks.filter(t => (t.date <= limitDate) && (t.status !== 'done' || t.date >= getTodayString()));
  
  const myTasks = visibleTasks.filter(t => t.currentHolderId === currentUser?.id && t.status === 'pending');
  const otherTasks = visibleTasks; // 任務列表顯示所有 (包含自己和別人)

  // UI
  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[#28C8C8]"/></div>;

  // 1️⃣ Landing Page
  if (viewState === 'landing') return (
    <div className="max-w-md mx-auto h-[100dvh] flex flex-col p-8 bg-white relative">
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
    // ✨ 手機固定佈局 (Fixed Layout)
    <div className="fixed inset-0 bg-gray-50 max-w-md mx-auto flex flex-col h-[100dvh]">
      {/* Header */}
      <header className="flex-none bg-white p-4 border-b flex justify-between items-center z-20">
        <h1 className="font-bold text-lg text-gray-800">{groupName}</h1>
        <div className="relative">
          <div onClick={(e) => { e.stopPropagation(); setIsUserMenuOpen(!isUserMenuOpen); }} className="flex items-center gap-2 bg-gray-100 p-1 pr-3 rounded-full cursor-pointer">
            <img src={currentUser?.avatar} className="w-8 h-8 rounded-full border border-white" />
            <span className="text-sm font-bold text-gray-700">{currentUser?.name}</span>
          </div>
          {isUserMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white border rounded-xl shadow-xl z-50 overflow-hidden animate-in slide-in-from-top-2">
               <button onClick={() => { setViewState('landing'); setGroupId(null); setIsUserMenuOpen(false); window.history.pushState({}, '', window.location.pathname); }} className="w-full text-left p-4 text-base border-b flex items-center gap-3 hover:bg-gray-50 font-bold text-gray-600"><Home size={18}/> 我的空間</button>
               <button onClick={handleQuitGroup} className="w-full text-left p-4 text-base text-red-500 flex items-center gap-3 hover:bg-gray-50 font-bold"><LogOut size={18}/> 退出群組</button>
            </div>
          )}
        </div>
      </header>
      {isUserMenuOpen && <div className="fixed inset-0 z-10" onClick={() => setIsUserMenuOpen(false)}></div>}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 pb-24 overscroll-contain">
        {view === 'roster' && (
          <div className="space-y-6">
            <section>
              <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-3 text-lg"><CheckCircle2 size={20} className="text-[#28C8C8]"/> 近期待辦</h3>
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
                <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-3 text-lg"><Users size={20}/> 任務列表</h3>
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                {otherTasks.length === 0 ? <div className="p-8 text-center text-gray-400 text-base">目前沒有任務 🎉</div> :
                  (showAllTaskList ? otherTasks : otherTasks.slice(0, TASKS_LIMIT)).map(task => {
                    const isOpen = task.status === 'open';
                    const isDone = task.status === 'done';
                    const holder = users.find(u => u.id === task.currentHolderId);
                    return (
                      <div key={task.id} className={`p-4 flex items-center justify-between border-b last:border-0 ${isOpen ? 'bg-red-50' : ''}`}>
                        <div className="flex items-center gap-3">
                          <span className={`text-3xl ${isDone ? 'opacity-30' : ''}`}>{task.icon}</span>
                          <div>
                            <div className="font-bold text-base text-gray-800">{task.name}</div>
                            <div className="text-sm text-gray-400 font-bold">{task.date} · {holder ? holder.name : '未分配'}</div>
                          </div>
                        </div>
                        {isOpen && <button onClick={() => claimTask(task)} className="bg-red-500 text-white px-3 py-2 rounded-lg text-sm font-bold">接單 +${task.price}</button>}
                        {isDone && <CheckCircle2 className="text-green-300" size={24}/>}
                      </div>
                    )
                  })
                }
                {otherTasks.length > TASKS_LIMIT && (
                  <div onClick={() => setShowAllTaskList(!showAllTaskList)} className="p-3 text-center text-[#28C8C8] font-bold text-sm bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors">
                    {showAllTaskList ? '收起' : `查看更多 (還有 ${otherTasks.length - TASKS_LIMIT} 筆)`}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {view === 'wallet' && (
          <div className="space-y-6">
            <div className="bg-[#28C8C8] p-8 rounded-3xl text-white shadow-lg shadow-[#28C8C8]/30">
              <div className="text-sm opacity-80 mb-1">我的收支</div>
              <div className="text-4xl font-bold font-mono tracking-tight">${users.find(u => u.id === currentUser?.id)?.balance || 0}</div>
            </div>
            
            {/* 智慧還款區塊 (直接顯示) */}
            <div className="bg-white rounded-2xl border shadow-sm p-4">
              <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><Sparkles size={18} className="text-[#28C8C8]"/> 智慧還款建議</h3>
              <div className="space-y-2">
                 {calculateSettlements().length === 0 ? <p className="text-gray-400 text-sm py-2">目前帳務平衡，無需結算</p> : 
                   calculateSettlements().map((tx, idx) => (
                     <div key={idx} className="bg-gray-50 p-3 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                          <span>{tx.fromName}</span>
                          <ArrowRight size={14} className="text-gray-400"/>
                          <span>{tx.toName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold">${tx.amount}</span>
                          <button onClick={() => settleDebt(tx)} className="bg-[#28C8C8] text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm">結清</button>
                        </div>
                     </div>
                   ))
                 }
              </div>
            </div>

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
                 }} className="bg-[#28C8C8] text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md flex items-center gap-1"><Plus size={16}/> 邀請室友</button>
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
                <button onClick={() => { setEditingConfigId(null); setConfigForm({ name: '', price: 30, freq: 7, icon: '🧹', defaultAssigneeId: currentUser.id, nextDate: getTodayString() }); setIsEditingConfig(true); }} className="bg-[#28C8C8] text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md flex items-center gap-1"><Plus size={16}/> 新增家事</button>
              </div>
              <div className="space-y-3">
                {taskConfigs.map(c => (
                  <div key={c.id} className="flex justify-between items-center p-4 bg-white border rounded-xl shadow-sm">
                    <div className="flex items-center gap-4">
                      <span className="text-3xl">{c.icon}</span>
                      <div>
                        <div className="font-bold text-base text-gray-800">{c.name}</div>
                        <div className="text-sm text-gray-400 font-bold">${c.price} / {c.freq}</div>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <Edit2 size={20} className="text-[#28C8C8] cursor-pointer" onClick={() => { 
                         setEditingConfigId(c.id); 
                         const freqNum = c.freq && typeof c.freq === 'string' ? parseInt(c.freq.match(/\d+/)?.[0] || '7') : 7;
                         setConfigForm({ ...c, freq: freqNum, nextDate: c.nextDate || getTodayString() }); 
                         setIsEditingConfig(true); 
                      }}/>
                      <Trash2 size={20} className="text-red-500 cursor-pointer" onClick={() => setDeleteTarget({ type: 'config', id: c.id })}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer Nav (Fixed) */}
      <nav className="flex-none bg-white border-t flex justify-around pb-8 pt-3 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] z-30">
        {[{id:'roster', icon:CalendarDays, label:'值日表'}, {id:'wallet', icon:Wallet, label:'帳本'}, {id:'history', icon:Loader2, label:'動態'}, {id:'settings', icon:Settings, label:'設定'}].map(n => (
          <button key={n.id} onClick={() => setView(n.id)} className={`flex flex-col items-center w-full py-2 transition-all ${view === n.id ? 'text-[#28C8C8] scale-110' : 'text-gray-300'}`}><n.icon size={26}/><span className="text-xs font-bold mt-1.5">{n.label}</span></button>
        ))}
      </nav>

      {/* --- Modals --- */}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 text-center animate-in zoom-in-95">
             <div className="mb-4 text-red-500 flex justify-center"><AlertCircle size={48}/></div>
             <h3 className="font-bold text-xl mb-2 text-gray-800">確定刪除？</h3>
             <p className="text-gray-500 mb-6 text-base">此動作將刪除規則，無法復原。</p>
             <div className="flex gap-3">
               <button onClick={() => setDeleteTarget(null)} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-xl font-bold">取消</button>
               <button onClick={deleteConfigConfirm} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold">刪除</button>
             </div>
          </div>
        </div>
      )}

      {/* Edit Config Modal (UI Adjusted) */}
      {isEditingConfig && (
        <div className="fixed inset-0 bg-black/60 z-50 flex flex-col justify-end sm:justify-center">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 space-y-5 animate-in slide-in-from-bottom-5">
            <div className="flex justify-between items-center border-b pb-4">
              <h2 className="font-bold text-xl">{editingConfigId ? '編輯家事' : '新增家事'}</h2>
              <button onClick={() => setIsEditingConfig(false)} className="p-2 bg-gray-100 rounded-full"><X size={20}/></button>
            </div>
            
            <div className="flex gap-4">
              {/* 圖示 Input：刪除時確保不殘留 */}
              <input type="text" placeholder="🧹" value={configForm.icon} onChange={e => setConfigForm({...configForm, icon:e.target.value})} className="w-20 p-4 bg-gray-50 rounded-2xl text-center text-3xl outline-none focus:ring-2 focus:ring-[#28C8C8]"/>
              <input type="text" placeholder="名稱 (如：倒垃圾)" value={configForm.name} onChange={e => setConfigForm({...configForm, name:e.target.value})} className="flex-1 p-4 bg-gray-50 rounded-2xl text-lg font-bold outline-none focus:ring-2 focus:ring-[#28C8C8]"/>
            </div>
            
            {/* 錯誤訊息 */}
            {formError && <p className="text-red-500 text-sm font-bold ml-1">{formError}</p>}

            <div className="relative">
              <input type="number" value={configForm.price === 0 ? '' : configForm.price} onChange={e => setConfigForm({...configForm, price: e.target.value === '' ? 0 : Number(e.target.value)})} className="w-full h-14 px-4 bg-gray-50 rounded-2xl font-mono text-xl font-bold outline-none focus:ring-2 focus:ring-[#28C8C8]"/>
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">元</span>
            </div>

            <div className="relative">
              <input type="number" value={configForm.freq === 0 ? '' : configForm.freq} onChange={e => setConfigForm({...configForm, freq: e.target.value === '' ? 0 : Number(e.target.value)})} className="w-full h-14 px-4 pl-14 bg-gray-50 rounded-2xl font-mono text-xl font-bold outline-none focus:ring-2 focus:ring-[#28C8C8] text-left"/>
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">每</span>
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">日一次</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-bold text-gray-400 ml-1">何時開始</label>
                <input type="date" value={configForm.nextDate} onChange={e => setConfigForm({...configForm, nextDate:e.target.value})} className="w-full h-14 px-3 bg-gray-50 rounded-2xl font-bold outline-none text-base"/>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-bold text-gray-400 ml-1">由誰開始</label>
                <select value={configForm.defaultAssigneeId} onChange={e => setConfigForm({...configForm, defaultAssigneeId:e.target.value})} className="w-full h-14 px-3 bg-gray-50 rounded-2xl font-bold outline-none appearance-none text-base">
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>

            <button onClick={saveConfig} className="w-full py-4 bg-[#28C8C8] text-white rounded-2xl font-bold text-xl shadow-xl shadow-[#28C8C8]/20 active:scale-95 transition-transform">儲存家事</button>
          </div>
        </div>
      )}

      {/* Alert */}
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