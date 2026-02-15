import React, { useState, useEffect } from 'react';
import liff from '@line/liff';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, update, serverTimestamp, remove } from "firebase/database";
import { 
  Trash2, Sparkles, Wallet, Users, CheckCircle2, Settings, Edit2, X, 
  CalendarDays, UserPlus, List, ChevronLeft, ChevronRight,
  Calendar, ChevronDown, ChevronUp, Check, Loader2, LogOut, Home, RefreshCw
} from 'lucide-react';

// ==========================================
// ⚙️ 系統設定區
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

// ==========================================
// 🛠️ 工具函式 (安全版)
// ==========================================

const getTodayString = () => new Date().toISOString().split('T')[0];
const isFutureDate = (dateStr) => {
  if (!dateStr) return false;
  return dateStr > getTodayString();
};
const generateGroupId = () => `rm-${Math.random().toString(36).substr(2, 9)}`;

// 日曆輔助
const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay(); 

// 安全讀取 LocalStorage
const getSavedGroups = () => {
  try {
    const raw = localStorage.getItem('roomie_groups');
    return raw ? JSON.parse(raw) : [];
  } catch (e) { 
    console.error("Storage Error", e);
    return []; 
  }
};

const saveGroupToLocal = (id, name) => {
  try {
    const groups = getSavedGroups();
    // 確保 id 和 name 都是字串
    if (!id || !name) return;
    const existing = groups.find(g => g.id === id);
    if (!existing) {
      const newGroups = [...groups, { id, name, lastVisited: Date.now() }];
      localStorage.setItem('roomie_groups', JSON.stringify(newGroups));
    } else {
      const newGroups = groups.map(g => g.id === id ? { ...g, name, lastVisited: Date.now() } : g);
      localStorage.setItem('roomie_groups', JSON.stringify(newGroups));
    }
  } catch (e) { console.error("Save Error", e); }
};

const removeGroupFromLocal = (id) => {
  try {
    const groups = getSavedGroups().filter(g => g.id !== id);
    localStorage.setItem('roomie_groups', JSON.stringify(groups));
  } catch (e) {}
};

// ==========================================
// 📱 主應用程式
// ==========================================

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

  // UI State
  const [view, setView] = useState('roster');
  const [rosterViewMode, setRosterViewMode] = useState('list');
  const [isMyTasksOpen, setIsMyTasksOpen] = useState(true);
  const [isTaskListOpen, setIsTaskListOpen] = useState(true);
  
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(getTodayString());
  const [calendarMonth, setCalendarMonth] = useState(new Date()); 
  const [myGroups, setMyGroups] = useState([]);

  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState(null);
  const [configForm, setConfigForm] = useState({
    name: '', price: 30, freq: 7, icon: '🧹', defaultAssigneeId: '', nextDate: getTodayString()
  });

  // ==========================================
  // 🔄 初始化
  // ==========================================
  useEffect(() => {
    const initApp = async () => {
      try {
        await liff.init({ liffId: LIFF_ID });
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        const lineUser = {
          id: profile.userId,
          name: profile.displayName || '無名氏',
          avatar: profile.pictureUrl || ''
        };
        setCurrentUser(lineUser);
        setMyGroups(getSavedGroups());

        const params = new URLSearchParams(window.location.search);
        const gId = params.get('g');

        if (gId) {
          enterGroup(gId, lineUser);
        } else {
          setViewState('landing');
          setLoading(false);
        }

      } catch (err) {
        console.error("Init Error:", err);
        setLoading(false);
      }
    };
    initApp();
  }, []);

  // 緊急重置功能：清除所有緩存
  const hardReset = () => {
    if(confirm("這將清除 App 的暫存資料（不會刪除群組），確定重置？")) {
      localStorage.clear();
      window.location.href = window.location.pathname; // 重整
    }
  };

  // ==========================================
  // 🚪 群組進出邏輯
  // ==========================================

  const enterGroup = async (gId, user = currentUser) => {
    if (!gId) return;
    setLoading(true);
    setGroupId(gId);
    
    try {
      const groupRef = ref(db, `groups/${gId}`);
      
      // 先用 get 做一次性讀取，確保畫面快點出來
      const snapshot = await get(groupRef);
      const data = snapshot.val();
      
      if (data) {
        processGroupData(data, user, gId);
      } else {
        alert("找不到此群組");
        setViewState('landing');
        setLoading(false);
        return;
      }

      // 接著才開啟實時監聽，同步後續變動
      onValue(groupRef, (snapshot) => {
        const newData = snapshot.val();
        if (newData) {
          processGroupData(newData, user, gId);
        }
      });

    } catch (error) {
      console.error("Firebase 連線錯誤:", error);
      alert("連線失敗，請檢查網路或 Firebase 規則");
      setLoading(false);
    }
  };

  // 抽離出處理資料的邏輯，避免重複撰寫
  const processGroupData = (data, user, gId) => {
    const safeUsers = data.users ? Object.values(data.users) : [];
    const safeConfigs = data.taskConfigs ? Object.values(data.taskConfigs) : [];
    const safeTasks = data.tasks ? Object.values(data.tasks) : [];
    const safeLogs = data.logs ? Object.values(data.logs) : [];

    safeTasks.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    safeLogs.sort((a, b) => (b.id || 0) - (a.id || 0));

    setUsers(safeUsers);
    setTaskConfigs(safeConfigs);
    setCurrentCycleTasks(safeTasks);
    setLogs(safeLogs);

    const gName = data.metadata?.name || '未命名空間';
    setGroupName(gName);
    saveGroupToLocal(gId, gName);
    setMyGroups(getSavedGroups());

    if (user && user.id && (!data.users || !data.users[user.id])) {
      registerNewMember(gId, user);
    }
    
    setViewState('app');
    setLoading(false);
  };

  const handleSwitchGroup = () => {
    setGroupId(null);
    setViewState('landing');
    window.history.pushState({}, '', window.location.pathname);
  };

  const handleCreateGroup = async () => {
    if (!currentUser) return;
    setLoading(true);
    const newGid = generateGroupId();
    const groupRef = ref(db, `groups/${newGid}`);
    const gName = `${currentUser.name} 的家`;
    
    const initialData = {
      metadata: { creator: currentUser.name, createdAt: serverTimestamp(), name: gName },
      users: { [currentUser.id]: { ...currentUser, balance: 0 } },
      taskConfigs: {},
      tasks: {},
      logs: { [Date.now()]: { id: Date.now(), msg: `🏠 空間已建立`, type: 'info', time: new Date().toLocaleTimeString() } }
    };

    await set(groupRef, initialData);
    enterGroup(newGid, currentUser);
  };

  const handleQuitGroup = async () => {
    if(!window.confirm("確定要退出此群組嗎？")) return;
    if (currentUser && currentUser.id) {
       await remove(ref(db, `groups/${groupId}/users/${currentUser.id}`));
    }
    removeGroupFromLocal(groupId);
    setMyGroups(getSavedGroups());
    handleSwitchGroup();
  };

  // ==========================================
  // ✍️ Firebase Actions
  // ==========================================

  const registerNewMember = async (gId, user) => {
    await set(ref(db, `groups/${gId}/users/${user.id}`), {
      ...user, balance: 0, joinedAt: serverTimestamp()
    });
    addLog(gId, `👋 歡迎新室友 ${user.name} 加入！`, 'success');
  };

  const completeTask = async (task) => {
    const updates = {};
    updates[`groups/${groupId}/tasks/${task.id}/status`] = 'done';
    await update(ref(db), updates);
    addLog(groupId, `✅ ${currentUser.name} 完成了 ${task.name}`, 'success');
  };

  const releaseTaskToBounty = async (task) => {
    const updates = {};
    updates[`groups/${groupId}/tasks/${task.id}/status`] = 'open';
    updates[`groups/${groupId}/tasks/${task.id}/currentHolderId`] = null;
    const myCurrentBalance = users.find(u => u.id === currentUser.id)?.balance || 0;
    updates[`groups/${groupId}/users/${currentUser.id}/balance`] = myCurrentBalance - task.price;
    await update(ref(db), updates);
    addLog(groupId, `💸 ${currentUser.name} 釋出 ${task.name} (賞金 $${task.price})`, 'warning');
  };

  const claimBountyTask = async (task) => {
    const updates = {};
    updates[`groups/${groupId}/tasks/${task.id}/status`] = 'pending';
    updates[`groups/${groupId}/tasks/${task.id}/currentHolderId`] = currentUser.id;
    const myCurrentBalance = users.find(u => u.id === currentUser.id)?.balance || 0;
    updates[`groups/${groupId}/users/${currentUser.id}/balance`] = myCurrentBalance + task.price;
    await update(ref(db), updates);
    addLog(groupId, `💰 ${currentUser.name} 接手了 ${task.name} 賺取 $${task.price}`, 'success');
  };

  const addLog = (gId, msg, type = 'info') => {
    const logId = Date.now();
    set(ref(db, `groups/${gId}/logs/${logId}`), {
      id: logId, msg, type, time: new Date().toLocaleTimeString()
    });
  };

  const shareInvite = async () => {
    // 這裡一定要用 LIFF 網址
    const inviteLink = `https://liff.line.me/${LIFF_ID}?g=${groupId}`;
    if (liff.isApiAvailable('shareTargetPicker')) {
      await liff.shareTargetPicker([{
        type: "text", text: `🏠 邀請你加入「${groupName}」！\n點擊連結加入排班與記帳：\n${inviteLink}`
      }]);
    } else {
      navigator.clipboard.writeText(inviteLink);
      alert("連結已複製！");
    }
  };

  const saveConfig = async () => {
    if (!configForm.name) return;
    const configId = editingConfigId || `cfg-${Date.now()}`;
    const updates = {};
    updates[`groups/${groupId}/taskConfigs/${configId}`] = {
      id: configId, ...configForm, freq: `每 ${configForm.freq} 天`
    };
    await update(ref(db), updates);
    setIsEditingConfig(false);
    setEditingConfigId(null);
    addLog(groupId, `🛠️ 更新了規則: ${configForm.name}`, 'info');
    
    // 如果是新增規則，詢問是否立即產生任務
    if (!editingConfigId && window.confirm("規則已儲存！是否要立即產生這個任務？")) {
       const taskId = `task-${configId}-${Date.now()}`;
       await update(ref(db), {
         [`groups/${groupId}/tasks/${taskId}`]: {
            id: taskId, configId, name: configForm.name, price: configForm.price, 
            icon: configForm.icon, date: getTodayString(), status: 'pending', 
            currentHolderId: configForm.defaultAssigneeId
         }
       });
    }
  };

  const deleteConfig = async (configId) => {
    if(!window.confirm("確定刪除？")) return;
    await remove(ref(db, `groups/${groupId}/taskConfigs/${configId}`));
  };

  const openConfigEditor = (config = null) => {
    if (config) {
      setEditingConfigId(config.id);
      let freqNum = 7;
      if (config.freq && typeof config.freq === 'string') {
        const match = config.freq.match(/\d+/);
        if (match) freqNum = parseInt(match[0]);
      }
      setConfigForm({
        name: config.name || '', price: config.price || 0, freq: freqNum,
        icon: config.icon || '🧹', defaultAssigneeId: config.defaultAssigneeId || currentUser.id, nextDate: config.nextDate || getTodayString()
      });
    } else {
      setEditingConfigId(null);
      setConfigForm({ name: '', price: 30, freq: 7, icon: '🧹', defaultAssigneeId: currentUser.id, nextDate: getTodayString() });
    }
    setIsEditingConfig(true);
  };

  // ==========================================
  // 🖼️ UI 渲染
  // ==========================================

  if (loading) return (
    <div className="flex flex-col h-[100dvh] items-center justify-center bg-gray-50">
      <Loader2 className="animate-spin text-[#28C8C8] mb-4" size={48} />
      <p className="text-gray-500 font-medium">載入中...</p>
      {/* 萬一卡住，提供這個重置按鈕 */}
      <button onClick={hardReset} className="mt-8 text-xs text-gray-400 underline flex items-center gap-1">
        <RefreshCw size={12}/> APP若卡住請點此重置
      </button>
    </div>
  );

  // 1️⃣ Landing View: 我的群組列表
  if (viewState === 'landing') return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 max-w-md mx-auto border-x">
      <div className="p-8 bg-white border-b shadow-sm">
        <h1 className="text-2xl font-bold text-gray-800">👋 嗨，{currentUser?.name}</h1>
        <p className="text-gray-500 text-sm mt-1">選擇一個空間開始管理家事</p>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {myGroups.length === 0 ? (
          <div className="text-center py-10 opacity-50">
            <Sparkles size={48} className="mx-auto text-gray-300 mb-4"/>
            <p>你還沒加入任何群組</p>
          </div>
        ) : (
          myGroups.map(g => {
            const lastVisitedDate = new Date(g.lastVisited);
            const dateStr = isNaN(lastVisitedDate.getTime()) ? '未知時間' : lastVisitedDate.toLocaleDateString();
            return (
              <div key={g.id} onClick={() => enterGroup(g.id)} className="bg-white p-4 rounded-xl border shadow-sm flex justify-between items-center cursor-pointer hover:border-[#28C8C8] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#28C8C8]/10 rounded-full flex items-center justify-center text-[#28C8C8]">
                    <Home size={20}/>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800">{g.name}</h3>
                    <p className="text-xs text-gray-400">上次訪問: {dateStr}</p>
                  </div>
                </div>
                <ChevronRight size={20} className="text-gray-300"/>
              </div>
            );
          })
        )}
      </div>

      <div className="p-4 bg-white border-t">
        <button onClick={handleCreateGroup} className="w-full py-4 bg-[#28C8C8] text-white rounded-2xl font-bold shadow-xl shadow-[#28C8C8]/30 flex items-center justify-center gap-2 active:scale-95 transition-transform">
          <UserPlus size={20} /> 建立新空間
        </button>
      </div>
    </div>
  );

  // 編輯器 Modal
  if (isEditingConfig) return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col animate-slide-up max-w-md mx-auto">
      <div className="p-4 border-b flex justify-between items-center bg-gray-50">
        <h2 className="font-bold text-lg">{editingConfigId ? '編輯規則' : '新增規則'}</h2>
        <button onClick={() => setIsEditingConfig(false)} className="p-2 bg-white rounded-full"><X size={20} /></button>
      </div>
      <div className="p-6 space-y-6 flex-1 overflow-y-auto">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">名稱與圖示</label>
          <div className="flex gap-2">
             <input type="text" value={configForm.icon} onChange={e => setConfigForm({...configForm, icon: e.target.value})} className="w-14 h-12 text-center text-2xl border border-gray-300 rounded-xl" />
             <input type="text" placeholder="例如：倒垃圾" value={configForm.name} onChange={e => setConfigForm({...configForm, name: e.target.value})} className="flex-1 px-4 border border-gray-300 rounded-xl" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">賞金 (NT$)</label>
          <input type="number" value={configForm.price} onChange={e => setConfigForm({...configForm, price: Number(e.target.value)})} className="w-full px-4 py-3 border border-gray-300 rounded-xl text-lg font-mono" />
        </div>
        <div>
           <label className="block text-sm font-bold text-gray-700 mb-2">頻率 (天)</label>
           <div className="flex items-center gap-3">
             <span>每</span>
             <input type="number" value={configForm.freq} onChange={e => setConfigForm({...configForm, freq: Number(e.target.value)})} className="w-24 text-center py-2 border border-gray-300 rounded-xl font-bold" />
             <span>天一次</span>
           </div>
        </div>
        <div>
           <label className="block text-sm font-bold text-gray-700 mb-2">預設負責人</label>
           <select value={configForm.defaultAssigneeId} onChange={e => setConfigForm({...configForm, defaultAssigneeId: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-white">
             {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
           </select>
        </div>
      </div>
      <div className="p-4 border-t">
        <button onClick={saveConfig} className="w-full py-4 bg-[#28C8C8] text-white rounded-xl font-bold text-lg shadow-lg">儲存設定</button>
      </div>
    </div>
  );

  // 2️⃣ App View: 群組內部
  return (
    <div className="fixed inset-0 flex flex-col bg-gray-50 max-w-md mx-auto border-x overflow-hidden h-[100dvh]">
      <header className="flex-none bg-white px-4 py-4 border-b flex justify-between items-center z-10">
        <div className="flex items-center gap-2 cursor-pointer" onClick={handleSwitchGroup}>
           <button className="p-1.5 rounded-full bg-gray-100 hover:bg-gray-200"><ChevronLeft size={20}/></button>
           <div>
             <h1 className="font-bold text-gray-800 text-lg leading-none">{groupName}</h1>
           </div>
        </div>
        <div className="flex items-center gap-2 bg-gray-100 rounded-full pl-1 pr-3 py-1">
          <img src={currentUser?.avatar} className="w-6 h-6 rounded-full border border-white" alt="me" />
          <span className="text-xs font-bold text-gray-700 truncate max-w-[80px]">{currentUser?.name}</span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
        {view === 'roster' && (
          <div className="space-y-4 animate-fade-in">
            {/* 模式切換 */}
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button onClick={() => setRosterViewMode('list')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${rosterViewMode === 'list' ? 'bg-white text-[#28C8C8] shadow-sm' : 'text-gray-500'}`}><List size={16}/> 清單</button>
              <button onClick={() => setRosterViewMode('calendar')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${rosterViewMode === 'calendar' ? 'bg-white text-[#28C8C8] shadow-sm' : 'text-gray-500'}`}><CalendarDays size={16}/> 日曆</button>
            </div>

            {/* 清單模式 */}
            {rosterViewMode === 'list' && (
              <>
                {/* 我的待辦 */}
                <div>
                  <div className="flex justify-between items-end mb-3 cursor-pointer group" onClick={() => setIsMyTasksOpen(!isMyTasksOpen)}>
                    <h3 className="font-bold text-gray-700 flex items-center gap-2"><CheckCircle2 size={18} className="text-[#28C8C8]"/> 我的待辦 {isMyTasksOpen ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</h3>
                  </div>
                  {isMyTasksOpen && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                      {(() => {
                        const myTasks = currentCycleTasks.filter(t => t.currentHolderId === currentUser?.id && t.status === 'pending');
                        if (myTasks.length === 0) return <div className="p-6 text-center text-gray-400 text-sm">無待辦事項 🎉</div>;
                        return (
                          <div className="divide-y divide-gray-50">
                            {myTasks.map(task => (
                              <div key={task.id} className="p-4 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 bg-[#28C8C8]/10 rounded-full flex items-center justify-center text-xl shrink-0">{task.icon || '📝'}</div>
                                  <div>
                                    <h4 className="font-bold text-gray-800">{task.name}</h4>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className={`text-xs px-1.5 rounded font-mono ${task.date === getTodayString() ? 'bg-red-100 text-red-500 font-bold' : 'bg-gray-100 text-gray-500'}`}>{task.date === getTodayString() ? '今天' : task.date || '無日期'}</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => releaseTaskToBounty(task)} className="w-14 py-1.5 rounded-lg text-xs font-bold text-gray-500 bg-gray-100">沒空</button>
                                  <button disabled={isFutureDate(task.date || '')} onClick={() => completeTask(task)} className={`w-16 py-1.5 rounded-lg text-xs font-bold text-white ${isFutureDate(task.date || '') ? 'bg-gray-200' : 'bg-[#28C8C8]'}`}>完成</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* 任務列表 */}
                <div>
                   <div className="flex justify-between items-end mb-3 cursor-pointer group" onClick={() => setIsTaskListOpen(!isTaskListOpen)}>
                    <h3 className="font-bold text-gray-700 flex items-center gap-2"><Users size={18} className="text-gray-400"/> 任務列表 {isTaskListOpen ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</h3>
                  </div>
                  {isTaskListOpen && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                       <div className="divide-y divide-gray-50">
                         {currentCycleTasks.length === 0 ? <div className="p-6 text-center text-gray-400 text-sm">沒有任務</div> :
                          currentCycleTasks.map(task => {
                           const isMine = task.currentHolderId === currentUser?.id;
                           const isOpen = task.status === 'open';
                           const isDone = task.status === 'done';
                           const assignee = users.find(u => u.id === task.currentHolderId);
                           
                           return (
                             <div key={task.id} className={`p-4 flex items-center justify-between ${isOpen ? 'bg-red-50' : ''}`}>
                               <div className="flex items-center gap-4">
                                 <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0 ${isDone ? 'bg-green-100 opacity-50' : 'bg-gray-100'}`}>{task.icon || '📝'}</div>
                                 <div>
                                   <div className="flex items-center gap-2">
                                     <h4 className={`font-bold ${isDone ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{task.name}</h4>
                                     {isOpen && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold animate-pulse">釋出中</span>}
                                   </div>
                                   <div className="flex items-center gap-2 mt-1">
                                     <span className="text-xs bg-gray-100 px-1.5 rounded text-gray-500 font-mono">{task.date || '無日期'}</span>
                                     {!isDone && !isOpen && <span className={`text-xs ${isMine ? 'text-[#28C8C8] font-bold' : 'text-gray-500'}`}>{assignee ? assignee.name : '未知'}</span>}
                                   </div>
                                 </div>
                               </div>
                               <div>
                                 {isOpen ? <button onClick={() => claimBountyTask(task)} className="bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold">接單 +${task.price}</button> : isDone ? <CheckCircle2 className="text-green-300" size={24}/> : isMine ? <div className="w-8 h-8 rounded-full border-2 border-[#28C8C8]/30 flex items-center justify-center text-[#28C8C8]"><CheckCircle2 size={18}/></div> : null}
                               </div>
                             </div>
                           )
                         })}
                       </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* 日曆模式 */}
            {rosterViewMode === 'calendar' && (
               <div>
                 <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
                   <div className="flex items-center justify-between mb-4">
                     <button onClick={() => { const d = new Date(calendarMonth); d.setMonth(d.getMonth() - 1); setCalendarMonth(d); }} className="p-1 hover:bg-gray-100 rounded-full"><ChevronLeft size={20} /></button>
                     <h3 className="font-bold text-lg text-gray-800">{calendarMonth.getFullYear()}年 {calendarMonth.getMonth() + 1}月</h3>
                     <button onClick={() => { const d = new Date(calendarMonth); d.setMonth(d.getMonth() + 1); setCalendarMonth(d); }} className="p-1 hover:bg-gray-100 rounded-full"><ChevronRight size={20} /></button>
                   </div>
                   <div className="grid grid-cols-7 text-center mb-2">
                     {['日', '一', '二', '三', '四', '五', '六'].map(d => <span key={d} className="text-xs font-bold text-gray-400">{d}</span>)}
                   </div>
                   <div className="grid grid-cols-7 gap-1">
                     {Array.from({ length: getDaysInMonth(calendarMonth.getFullYear(), calendarMonth.getMonth()) + getFirstDayOfMonth(calendarMonth.getFullYear(), calendarMonth.getMonth()) }).map((_, i) => {
                       const firstDay = getFirstDayOfMonth(calendarMonth.getFullYear(), calendarMonth.getMonth());
                       if (i < firstDay) return <div key={`empty-${i}`} className="aspect-square"></div>;
                       const day = i - firstDay + 1;
                       const dateStr = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                       const isSelected = dateStr === calendarSelectedDate;
                       const dayTasks = currentCycleTasks.filter(t => t.date === dateStr);
                       return (
                         <div key={day} onClick={() => setCalendarSelectedDate(dateStr)} className={`aspect-square rounded-lg flex flex-col items-center justify-center cursor-pointer border ${isSelected ? 'border-[#28C8C8] bg-[#28C8C8]/10' : 'border-transparent hover:bg-gray-50'}`}>
                           <span className={`text-sm ${isSelected ? 'font-bold text-[#28C8C8]' : 'text-gray-700'}`}>{day}</span>
                           <div className="flex gap-0.5 mt-1">
                             {dayTasks.slice(0, 3).map((t, idx) => <div key={idx} className={`w-1.5 h-1.5 rounded-full ${t.status === 'done' ? 'bg-green-300' : t.status === 'open' ? 'bg-red-500' : 'bg-[#28C8C8]/50'}`}></div>)}
                           </div>
                         </div>
                       );
                     })}
                   </div>
                 </div>
                 
                 <div>
                   <h4 className="font-bold text-gray-700 mb-3 flex items-center gap-2">📅 {calendarSelectedDate} 的任務</h4>
                   <div className="space-y-3">
                     {currentCycleTasks.filter(t => t.date === calendarSelectedDate).length === 0 ? 
                       <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-400 text-sm border border-dashed">今日無任務</div> : 
                       currentCycleTasks.filter(t => t.date === calendarSelectedDate).map(task => {
                         const isDone = task.status === 'done';
                         return (
                           <div key={task.id} className="bg-white p-4 rounded-xl border shadow-sm flex items-center justify-between">
                             <div className="flex items-center gap-3">
                               <span className="text-2xl">{task.icon || '📝'}</span>
                               <h5 className={`font-bold ${isDone ? 'line-through text-gray-400' : 'text-gray-800'}`}>{task.name}</h5>
                             </div>
                             {isDone ? <CheckCircle2 className="text-green-400" size={20}/> : <span className="text-xs text-gray-400">未完成</span>}
                           </div>
                         )
                       })
                     }
                   </div>
                 </div>
               </div>
            )}
          </div>
        )}

        {view === 'wallet' && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-gradient-to-br from-[#28C8C8] to-[#1facac] rounded-2xl p-6 text-white shadow-xl">
               <p className="text-white/80 text-xs mb-1">我的結餘</p>
               <h2 className="text-4xl font-bold font-mono">{users.find(u => u.id === currentUser?.id)?.balance || 0}</h2>
            </div>
            <div className="bg-white rounded-xl shadow-sm border divide-y">
               {users.map(u => (
                 <div key={u.id} className="p-4 flex justify-between items-center">
                   <div className="flex items-center gap-3"><img src={u.avatar} className="w-10 h-10 rounded-full"/> <span className="font-bold text-gray-700">{u.name}</span></div>
                   <span className={`font-mono font-bold ${u.balance >= 0 ? 'text-[#28C8C8]' : 'text-red-500'}`}>{u.balance > 0 ? '+' : ''}{u.balance}</span>
                 </div>
               ))}
            </div>
          </div>
        )}

        {view === 'history' && (
          <div className="space-y-4 animate-fade-in">
            <h3 className="font-bold text-gray-800">最新動態</h3>
            <div className="space-y-4 pl-4 border-l-2 border-gray-100">
              {logs.map(log => (
                <div key={log.id} className="relative pb-4">
                  <div className={`absolute -left-[21px] top-1 w-3 h-3 rounded-full border-2 border-white ${log.type === 'success' ? 'bg-green-500' : log.type === 'warning' ? 'bg-red-500' : 'bg-gray-400'}`}></div>
                  <p className="text-sm text-gray-800">{log.msg}</p>
                  <p className="text-[10px] text-gray-400">{log.time}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'settings' && (
          <div className="space-y-6 animate-fade-in">
             <div className="bg-white rounded-xl p-4 shadow-sm border">
               <div className="flex justify-between items-center mb-2">
                 <h3 className="font-bold text-gray-800">成員邀請</h3>
                 <button onClick={shareInvite} className="text-xs bg-[#28C8C8] text-white px-3 py-1.5 rounded-full font-bold">傳送連結</button>
               </div>
               <p className="text-xs text-gray-400">目前成員: {users.length} 人</p>
             </div>

             <div className="bg-white rounded-xl p-4 shadow-sm border">
               <div className="flex justify-between items-center mb-4">
                 <h3 className="font-bold text-gray-800 flex items-center gap-2"><Settings size={18}/> 家事規則</h3>
                 <button onClick={() => openConfigEditor()} className="text-xs bg-[#28C8C8]/10 text-[#28C8C8] px-2 py-1 rounded font-bold">+ 新增</button>
               </div>
               <div className="space-y-2">
                 {taskConfigs.length === 0 ? <p className="text-gray-400 text-xs text-center py-4">還沒設定規則</p> : 
                   taskConfigs.map(cfg => (
                     <div key={cfg.id} className="flex justify-between items-center p-2 hover:bg-gray-50 rounded">
                       <div className="flex items-center gap-3">
                         <span className="text-xl">{cfg.icon || '📝'}</span>
                         <div><div className="font-bold text-sm text-gray-800">{cfg.name}</div><div className="text-xs text-gray-400">{cfg.freq} / ${cfg.price}</div></div>
                       </div>
                       <div className="flex gap-2">
                         <button onClick={() => openConfigEditor(cfg)} className="text-gray-400 hover:text-[#28C8C8]"><Edit2 size={16}/></button>
                         <button onClick={() => deleteConfig(cfg.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={16}/></button>
                       </div>
                     </div>
                   ))
                 }
               </div>
             </div>

             <div className="space-y-3 pt-4">
               <button onClick={handleSwitchGroup} className="w-full py-3 bg-white border border-gray-200 text-gray-600 rounded-xl font-bold text-sm shadow-sm flex items-center justify-center gap-2">
                 <List size={16}/> 切換群組 (回到列表)
               </button>
               <button onClick={handleQuitGroup} className="w-full py-3 bg-white border border-red-100 text-red-500 rounded-xl font-bold text-sm shadow-sm flex items-center justify-center gap-2">
                 <LogOut size={16}/> 退出此群組
               </button>
             </div>
          </div>
        )}
      </main>

      <nav className="bg-white border-t flex justify-around pb-6 pt-2 z-10 sticky bottom-0">
        <button onClick={() => setView('roster')} className={`flex flex-col items-center w-full py-2 ${view === 'roster' ? 'text-[#28C8C8]' : 'text-gray-400'}`}><CalendarDays size={24}/><span className="text-[10px] mt-1">值日表</span></button>
        <button onClick={() => setView('wallet')} className={`flex flex-col items-center w-full py-2 ${view === 'wallet' ? 'text-[#28C8C8]' : 'text-gray-400'}`}><Wallet size={24}/><span className="text-[10px] mt-1">帳本</span></button>
        <button onClick={() => setView('history')} className={`flex flex-col items-center w-full py-2 ${view === 'history' ? 'text-[#28C8C8]' : 'text-gray-400'}`}><History size={24}/><span className="text-[10px] mt-1">動態</span></button>
        <button onClick={() => setView('settings')} className={`flex flex-col items-center w-full py-2 ${view === 'settings' ? 'text-[#28C8C8]' : 'text-gray-400'}`}><Settings size={24}/><span className="text-[10px] mt-1">設定</span></button>
      </nav>
    </div>
  );
}