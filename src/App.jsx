import React, { useState, useEffect } from 'react';
import { 
  Trash2, 
  Sparkles, 
  Wallet, 
  Users, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  DollarSign,
  Plus,
  ArrowRight,
  UserCircle2,
  MoreVertical,
  History,
  MessageCircle,
  Settings,
  Edit2,
  Save,
  X,
  Play,
  CalendarDays,
  AlertTriangle,
  UserPlus,
  Palette,
  List,
  ChevronLeft,
  ChevronRight,
  User,
  Calendar,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Check,
  Loader2
} from 'lucide-react';

// ==========================================
// ⚙️ 系統設定區 (System Config)
// ==========================================

const ENABLE_FIREBASE = false; 

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// ==========================================
// 🛠️ 模擬資料與工具 (Mock Data & Utils)
// ==========================================

const getTodayString = () => {
  const d = new Date();
  return d.toISOString().split('T')[0];
};

const getFutureDate = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

// 檢查日期是否為未來
const isFutureDate = (dateStr) => {
  return dateStr > getTodayString();
};

// 格式化日期物件為 YYYY-MM-DD
const formatDate = (dateObj) => {
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
};

// 解析頻率字串為天數
const getIntervalDays = (freqString) => {
  const match = freqString.match(/每 (\d+) 天/);
  if (match) return parseInt(match[1], 10);
  return 7; // default fallback
};

// --- 模擬資料設定 ---
const INITIAL_USERS = [
  { id: 'u1', name: '王小明', balance: -150, avatar: 'bg-blue-400' }, // 模擬負債
  { id: 'u2', name: '李大華', balance: 50, avatar: 'bg-emerald-400' },
  { id: 'u3', name: '陳小美', balance: 100, avatar: 'bg-rose-400' }, // 模擬債權人
];

// 初始化任務設定
const INITIAL_TASK_CONFIG = [
  { id: 't1', name: '倒垃圾', price: 30, freq: '每 7 天', icon: '🗑️', defaultAssigneeId: 'u1', nextDate: getTodayString() },
  { id: 't2', name: '倒回收', price: 30, freq: '每 7 天', icon: '♻️', defaultAssigneeId: 'u2', nextDate: getFutureDate(1) },
  { id: 't3', name: '掃廁所', price: 80, freq: '每 14 天', icon: '🚽', defaultAssigneeId: 'u3', nextDate: getFutureDate(2) },
  { id: 't4', name: '清排水孔', price: 40, freq: '每 14 天', icon: '🚿', defaultAssigneeId: 'u1', nextDate: getFutureDate(3) },
  { id: 't5', name: '吸地板', price: 50, freq: '每 7 天', icon: '🧹', defaultAssigneeId: 'u2', nextDate: getFutureDate(4) },
];

const AVATAR_COLORS = [
  'bg-blue-400', 'bg-emerald-400', 'bg-rose-400', 'bg-amber-400', 
  'bg-violet-400', 'bg-red-400', 'bg-[#28C8C8]', 'bg-orange-400'
];

// --- Mock LIFF (模擬 LINE 環境) ---
const mockLiff = {
  isInClient: true, 
  sendMessages: (messages) => {
    return new Promise((resolve) => {
      console.log('LIFF 发送消息:', messages);
      console.log(`[模擬 LINE 通知] ${messages[0].text}`);
      resolve();
    });
  }
};

// ==========================================
// 📱 主應用程式 (Main App)
// ==========================================

export default function RoomieTaskApp() {
  // --- State ---
  const [users, setUsers] = useState(INITIAL_USERS);
  const [currentUser, setCurrentUser] = useState(INITIAL_USERS[0]); 
  
  // 任務相關 State
  const [taskConfigs, setTaskConfigs] = useState(INITIAL_TASK_CONFIG); 
  const [currentCycleTasks, setCurrentCycleTasks] = useState([]); 
  const [logs, setLogs] = useState([]); 
  
  const [view, setView] = useState('roster'); 
  const [rosterViewMode, setRosterViewMode] = useState('list'); 
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(getTodayString());
  const [calendarMonth, setCalendarMonth] = useState(new Date()); 
  
  // 1. 分頁狀態 (Load More) - 修改預設值為 3
  const [visibleMyTasksCount, setVisibleMyTasksCount] = useState(3);
  const [visibleAllTasksCount, setVisibleAllTasksCount] = useState(3);
  
  // 折疊狀態 (預設展開)
  const [isMyTasksOpen, setIsMyTasksOpen] = useState(true);
  const [isTaskListOpen, setIsTaskListOpen] = useState(true);

  // 任務編輯模式 State
  const [isEditingTask, setIsEditingTask] = useState(null);
  const [editForm, setEditForm] = useState({ 
    name: '', price: '', freq: '每 7 天', icon: '🧹', defaultAssigneeId: '', nextDate: getTodayString() 
  });
  const [customDays, setCustomDays] = useState(7);

  // 室友編輯模式 State
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [userForm, setUserForm] = useState({ name: '', avatar: 'bg-blue-400' });

  // 確認視窗狀態
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'confirm', 
    onConfirm: () => {}
  });

  // --- 初始化模擬數據 ---
  useEffect(() => {
    if (!users.find(u => u.id === currentUser?.id) && users.length > 0) {
      setCurrentUser(users[0]);
    }

    if (currentCycleTasks.length === 0 && users.length > 0) {
      dispatchTasksFromConfig(); 
    }
  }, [users.length]);

  useEffect(() => {
    if (users.length > 0 && (!currentUser || !users.find(u => u.id === currentUser.id))) {
      setCurrentUser(users[0]);
    }
  }, [users]);

  // --- 核心邏輯 ---

  const dispatchTasksFromConfig = () => {
    if (users.length === 0) return;
    
    const generatedTasks = [];
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() + 45);

    taskConfigs.forEach((config) => {
      const interval = getIntervalDays(config.freq);
      let currentDate = new Date(config.nextDate || getTodayString()); 
      
      let assigneeIndex = users.findIndex(u => u.id === config.defaultAssigneeId);
      if (assigneeIndex === -1) assigneeIndex = 0;

      let occurrenceCount = 0;

      while (currentDate <= limitDate) {
        const assignee = users[(assigneeIndex + occurrenceCount) % users.length];
        
        generatedTasks.push({
          id: `cycle-${config.id}-${formatDate(currentDate)}`, 
          configId: config.id,
          assigneeId: assignee.id, 
          currentHolderId: assignee.id, 
          status: 'pending', 
          price: config.price,
          name: config.name,
          icon: config.icon,
          freq: config.freq,
          date: formatDate(currentDate)
        });

        currentDate.setDate(currentDate.getDate() + interval);
        occurrenceCount++;
      }
    });

    generatedTasks.sort((a, b) => a.date.localeCompare(b.date));

    setCurrentCycleTasks(generatedTasks);
    // 重置分頁計數 - 修改預設值為 3
    setVisibleMyTasksCount(3);
    setVisibleAllTasksCount(3);
    setView('roster');
  };

  // --- 結算建議計算 ---
  const calculateSettlements = () => {
    let debtors = users.filter(u => u.balance < 0).map(u => ({...u})).sort((a, b) => a.balance - b.balance);
    let creditors = users.filter(u => u.balance > 0).map(u => ({...u})).sort((a, b) => b.balance - a.balance);
    
    const settlements = [];
    
    let i = 0; 
    let j = 0; 
    
    while (i < debtors.length && j < creditors.length) {
      let debtor = debtors[i];
      let creditor = creditors[j];
      
      let amount = Math.min(Math.abs(debtor.balance), creditor.balance);
      
      if (amount > 0) {
        settlements.push({
          fromId: debtor.id,
          fromName: debtor.name,
          toId: creditor.id,
          toName: creditor.name,
          amount: amount
        });
      }

      debtor.balance += amount;
      creditor.balance -= amount;

      if (Math.abs(debtor.balance) < 0.01) i++;
      if (creditor.balance < 0.01) j++;
    }
    
    return settlements;
  };

  // --- 視窗控制 ---
  const showConfirm = (title, message, onConfirm) => {
    setConfirmModal({ isOpen: true, title, message, type: 'confirm', onConfirm });
  };

  const showAlert = (title, message) => {
    setConfirmModal({ isOpen: true, title, message, type: 'alert', onConfirm: () => {} });
  };

  const closeConfirmModal = () => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
  };

  // --- Actions ---
  const saveTaskConfig = () => {
    if (!editForm.name || editForm.price === '' || Number(editForm.price) < 0 || !editForm.nextDate) return;

    const price = Number(editForm.price);
    const finalFreq = `每 ${customDays} 天`;
    
    const newConfig = { ...editForm, price, freq: finalFreq };

    if (isEditingTask) {
      setTaskConfigs(prev => prev.map(t => t.id === isEditingTask ? { ...t, ...newConfig } : t));
    } else {
      setTaskConfigs(prev => [...prev, { id: `t${Date.now()}`, ...newConfig }]);
    }
    closeEditor();
  };

  const confirmDeleteTaskConfig = (id) => {
    showConfirm(
      '刪除家務規則',
      '確定要刪除這個家務設定嗎？這會一併清除目前值日表上的相關任務。',
      () => {
        setTaskConfigs(prev => prev.filter(t => t.id !== id));
        setCurrentCycleTasks(prev => prev.filter(t => t.configId !== id));
        closeConfirmModal();
      }
    );
  };

  const saveUser = () => {
    if (!userForm.name.trim()) return;
    const newUser = {
      id: `u${Date.now()}`,
      name: userForm.name,
      avatar: userForm.avatar,
      balance: 0
    };
    setUsers(prev => [...prev, newUser]);
    setIsAddingUser(false);
    setUserForm({ name: '', avatar: 'bg-blue-400' });
    addLog(`👋 歡迎新室友 ${newUser.name} 加入！`, 'success');
  };

  const confirmDeleteUser = (userId) => {
    const userToDelete = users.find(u => u.id === userId);
    if (!userToDelete) return;

    if (userToDelete.balance !== 0) {
      showAlert('無法刪除', `無法刪除 ${userToDelete.name}，因為他的帳戶餘額不為 0。請先結清帳款。`);
      return;
    }

    showConfirm(
      '刪除室友',
      `確定要刪除 ${userToDelete.name} 嗎？他目前負責的任務將會變為「待認領」狀態。`,
      () => {
        setUsers(prev => prev.filter(u => u.id !== userId));
        setCurrentCycleTasks(prev => prev.map(t => 
          t.currentHolderId === userId ? { ...t, status: 'open', currentHolderId: null } : t
        ));
        closeConfirmModal();
      }
    );
  };

  const executeSettlement = (fromId, toId, amount) => {
    showConfirm(
      '確認還款',
      `確定 ${getUserName(fromId)} 已經支付 $${amount} 給 ${getUserName(toId)} 了嗎？`,
      () => {
        setUsers(prev => prev.map(u => {
          if (u.id === fromId) return { ...u, balance: u.balance + amount };
          if (u.id === toId) return { ...u, balance: u.balance - amount };
          return u;
        }));
        addLog(`💸 ${getUserName(fromId)} 還清了欠 ${getUserName(toId)} 的 $${amount}`, 'success');
        closeConfirmModal();
      }
    );
  };

  const openEditor = (task = null) => {
    setIsEditingTask(task ? task.id : null);
    const defaultUser = users.length > 0 ? users[0].id : '';

    if (task) {
      const days = getIntervalDays(task.freq);
      setCustomDays(days);
      setEditForm({ 
        name: task.name, 
        price: task.price, 
        freq: task.freq, 
        icon: task.icon,
        defaultAssigneeId: task.defaultAssigneeId || defaultUser,
        nextDate: task.nextDate || getTodayString()
      });
    } else {
      setCustomDays(7); 
      setEditForm({ 
        name: '', 
        price: '', 
        freq: '每 7 天', 
        icon: '🧹',
        defaultAssigneeId: defaultUser,
        nextDate: getTodayString()
      });
    }
    setView('settings_editor');
  };
  const closeEditor = () => { setIsEditingTask(null); setView('settings'); };

  const completeTask = (taskId) => {
    const task = currentCycleTasks.find(t => t.id === taskId);
    setCurrentCycleTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'done' } : t));
    addLog(`✅ ${currentUser.name} 完成了 ${task.name}`, 'success');
    sendLineNotify('COMPLETE', { user: currentUser.name, task: task.name });
  };

  const releaseTask = (taskId) => {
    const task = currentCycleTasks.find(t => t.id === taskId);
    updateBalance(task.currentHolderId, -task.price);
    setCurrentCycleTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'open' } : t));
    addLog(`💸 ${getUserName(task.currentHolderId)} 釋出了 ${task.name}`, 'warning');
    sendLineNotify('RELEASE', { user: getUserName(task.currentHolderId), task: task.name, price: task.price });
  };

  const claimBounty = (taskId) => {
    const task = currentCycleTasks.find(t => t.id === taskId);
    updateBalance(currentUser.id, task.price);
    setCurrentCycleTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'pending', currentHolderId: currentUser.id } : t));
    addLog(`💰 ${currentUser.name} 接手了 ${task.name}`, 'success');
    sendLineNotify('CLAIM', { user: currentUser.name, task: task.name, price: task.price });
  };

  const updateBalance = (userId, amount) => {
    if (!userId) return;
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, balance: u.balance + amount } : u));
  };

  const getUserName = (id) => users.find(u => u.id === id)?.name || '未知';
  const getUserAvatar = (id) => users.find(u => u.id === id)?.avatar || 'bg-gray-300';
  const addLog = (msg, type = 'info') => setLogs(prev => [{ id: Date.now(), msg, type, time: new Date().toLocaleTimeString() }, ...prev]);

  const isFormValid = editForm.name.trim() !== '' && editForm.price !== '' && Number(editForm.price) >= 0 && editForm.nextDate && customDays > 0;

  // --- Calendar Helpers ---
  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay(); 

  const changeMonth = (delta) => {
    const newDate = new Date(calendarMonth);
    newDate.setMonth(newDate.getMonth() + delta);
    setCalendarMonth(newDate);
  };

  // --- UI Components ---
  const TabButton = ({ id, label, icon: Icon }) => (
    <button onClick={() => setView(id)} className={`flex flex-col items-center justify-center w-full py-3 transition-colors ${view === id || (view.startsWith(id)) ? 'text-[#28C8C8]' : 'text-gray-400'}`}>
      <Icon size={24} />
      <span className="text-xs mt-1 font-medium">{label}</span>
    </button>
  );

  // Helper: Load More Button Component
  const LoadMoreButton = ({ onClick }) => (
    <div className="p-2 text-center border-t border-gray-50">
      <button 
        onClick={onClick}
        className="text-xs text-[#28C8C8] hover:text-[#20a0a0] font-medium flex items-center justify-center gap-1 w-full py-2 hover:bg-[#28C8C8]/5 rounded transition-colors"
      >
        <ChevronDown size={14} /> 顯示更多
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 flex flex-col bg-gray-50 font-sans max-w-md mx-auto border-x border-gray-200 shadow-2xl overflow-hidden h-[100dvh]">
      
      {/* Modal Overlay */}
      {confirmModal.isOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl transform transition-all scale-100">
            <h3 className="text-xl font-bold text-gray-800 mb-2">{confirmModal.title}</h3>
            <p className="text-gray-600 text-sm mb-6 leading-relaxed">
              {confirmModal.message}
            </p>
            <div className="flex gap-3">
              {confirmModal.type === 'confirm' ? (
                <>
                  <button onClick={closeConfirmModal} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition-colors">取消</button>
                  <button onClick={confirmModal.onConfirm} className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-200 transition-colors">確認</button>
                </>
              ) : (
                <button onClick={closeConfirmModal} className="flex-1 py-3 bg-[#28C8C8] hover:bg-[#20a0a0] text-white rounded-xl font-bold transition-colors">知道了</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex-none bg-white px-4 py-4 border-b flex justify-between items-center z-10">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="font-bold text-gray-800 text-lg leading-tight">家事值日生</h1>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium">我是</span>
          <div className="flex items-center gap-2 bg-gray-100 rounded-full px-2 py-1.5 cursor-pointer hover:bg-gray-200 border border-gray-200 relative transition-colors">
            {currentUser && (
              <>
                <div className={`w-6 h-6 rounded-full ${currentUser.avatar} flex-shrink-0 border border-gray-200`}></div>
                <select 
                  className="bg-transparent text-sm font-bold outline-none text-gray-700 appearance-none pr-1 cursor-pointer"
                  value={currentUser.id}
                  onChange={(e) => setCurrentUser(users.find(u => u.id === e.target.value))}
                >
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-6 w-full relative">

        {/* VIEW: ROSTER */}
        {view === 'roster' && (
          <div className="space-y-4">
            
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button 
                onClick={() => setRosterViewMode('list')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${rosterViewMode === 'list' ? 'bg-white text-[#28C8C8] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <List size={16} /> 清單模式
              </button>
              <button 
                onClick={() => setRosterViewMode('calendar')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${rosterViewMode === 'calendar' ? 'bg-white text-[#28C8C8] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <CalendarDays size={16} /> 日曆模式
              </button>
            </div>

            {/* 我的待辦 */}
            {rosterViewMode === 'list' && (
              <div>
                <div 
                  className="flex justify-between items-end mb-3 cursor-pointer group"
                  onClick={() => setIsMyTasksOpen(!isMyTasksOpen)}
                >
                  <h3 className="font-bold text-gray-700 flex items-center gap-2 group-hover:text-[#28C8C8] transition-colors">
                    <CheckCircle2 size={18} className="text-gray-400 group-hover:text-[#28C8C8] transition-colors" /> 我的待辦
                    {isMyTasksOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                  </h3>
                  <span className="text-xs text-gray-400">今日事項優先</span>
                </div>
                
                {isMyTasksOpen && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in mb-6">
                    {(() => {
                      const myTasks = currentCycleTasks.filter(t => t.currentHolderId === currentUser?.id && t.status === 'pending');
                      if (myTasks.length === 0) return <div className="p-6 text-center text-gray-400 text-sm">目前沒有待辦事項 🎉</div>;
                      
                      const displayedTasks = myTasks.slice(0, visibleMyTasksCount);
                      
                      return (
                        <>
                          <div className="divide-y divide-gray-50">
                            {displayedTasks.map(task => {
                              const isTaskFuture = isFutureDate(task.date);
                              return (
                                <div key={task.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                  <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-[#28C8C8]/10 rounded-full flex items-center justify-center text-xl shrink-0">
                                      {task.icon}
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <h4 className="font-bold text-gray-800">{task.name}</h4>
                                      </div>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className={`text-xs px-1.5 rounded font-mono ${task.date === getTodayString() ? 'bg-red-100 text-red-500 font-bold' : 'bg-gray-100 text-gray-500'}`}>
                                          {task.date === getTodayString() ? '今天' : task.date}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                     <button 
                                       onClick={() => releaseTask(task.id)} 
                                       className="w-16 py-1.5 rounded-lg text-xs font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors flex justify-center items-center"
                                     >
                                       沒空
                                     </button>
                                     <button 
                                       onClick={() => completeTask(task.id)} 
                                       disabled={isTaskFuture}
                                       className={`w-20 py-1.5 rounded-lg text-xs font-bold transition-colors flex justify-center items-center
                                         ${isTaskFuture 
                                           ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                           : 'bg-[#28C8C8] text-white hover:bg-[#20a0a0] shadow-sm shadow-[#28C8C8]/30'
                                         }`}
                                     >
                                       {isTaskFuture ? '未開放' : '完成'}
                                     </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {myTasks.length > visibleMyTasksCount && (
                            <LoadMoreButton onClick={() => setVisibleMyTasksCount(prev => prev + 5)} />
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* --- LIST MODE (ALL TASKS) --- */}
            {rosterViewMode === 'list' && (
              <div>
                <div 
                  className="flex justify-between items-end mb-3 cursor-pointer group"
                  onClick={() => setIsTaskListOpen(!isTaskListOpen)}
                >
                  <h3 className="font-bold text-gray-700 flex items-center gap-2 group-hover:text-[#28C8C8] transition-colors">
                    <Users size={18} className="text-gray-400 group-hover:text-[#28C8C8] transition-colors" /> 任務列表
                    {isTaskListOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                  </h3>
                  <span className="text-xs text-gray-400">依日期排序</span>
                </div>

                {isTaskListOpen && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
                    {(() => {
                      const allTasks = [...currentCycleTasks].sort((a, b) => a.date.localeCompare(b.date));
                      if (allTasks.length === 0) return <div className="p-8 text-center text-gray-400">目前沒有排班任務</div>;
                      
                      const displayedAllTasks = allTasks.slice(0, visibleAllTasksCount);

                      return (
                        <>
                          <div className="divide-y divide-gray-50">
                            {displayedAllTasks.map(task => {
                              const isMine = task.currentHolderId === currentUser?.id;
                              const isOpen = task.status === 'open';
                              const isDone = task.status === 'done';
                              const isTaskFuture = isFutureDate(task.date);
                              
                              return (
                                <div key={task.id} className={`p-4 flex items-center justify-between transition-colors ${isOpen ? 'bg-red-50/50' : 'hover:bg-gray-50'}`}>
                                  <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0 ${isDone ? 'bg-green-100 opacity-50' : 'bg-gray-100'}`}>
                                      {task.icon}
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <h4 className={`font-bold ${isDone ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                                          {task.name}
                                        </h4>
                                        {isOpen && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold animate-pulse">釋出中</span>}
                                        {isDone && <span className="text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded font-bold">已完成</span>}
                                      </div>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className="text-xs bg-gray-100 px-1.5 rounded text-gray-500 font-mono">{task.date}</span>
                                        {!isDone && (
                                          <div className="flex items-center gap-1.5">
                                            {isOpen ? (
                                              <span className="text-xs text-red-500 font-medium flex items-center gap-1">
                                                賞金 ${task.price}
                                              </span>
                                            ) : (
                                              <>
                                                <div className={`w-3 h-3 rounded-full ${getUserAvatar(task.currentHolderId)}`}></div>
                                                <span className={`text-xs ${isMine ? 'font-bold text-[#28C8C8]' : 'text-gray-500'}`}>
                                                  {getUserName(task.currentHolderId)}{isMine && ' (我)'}
                                                </span>
                                              </>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div>
                                    {isOpen ? (
                                       <button onClick={() => claimBounty(task.id)} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm shadow-red-200 active:scale-95 transition-transform">
                                         接單 +${task.price}
                                       </button>
                                    ) : isDone ? (
                                       <CheckCircle2 className="text-green-300" size={24} />
                                    ) : isMine ? (
                                       <button 
                                         onClick={() => completeTask(task.id)} 
                                         disabled={isTaskFuture}
                                         className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors 
                                           ${isTaskFuture 
                                             ? 'border-gray-200 text-gray-300 cursor-not-allowed bg-gray-50' 
                                             : 'border-[#28C8C8]/30 hover:bg-[#28C8C8]/10 text-[#28C8C8]'
                                           }`}
                                       >
                                         <CheckCircle2 size={18} />
                                       </button>
                                    ) : (
                                       <span className="text-xs text-gray-300 font-mono">Pending</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {allTasks.length > visibleAllTasksCount && (
                            <LoadMoreButton onClick={() => setVisibleAllTasksCount(prev => prev + 5)} />
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* --- CALENDAR MODE --- */}
            {rosterViewMode === 'calendar' && (
              <div className="animate-fade-in">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
                  <div className="flex items-center justify-between mb-4">
                    <button onClick={() => { const d = new Date(calendarMonth); d.setMonth(d.getMonth() - 1); setCalendarMonth(d); }} className="p-1 hover:bg-gray-100 rounded-full"><ChevronLeft size={20} /></button>
                    <h3 className="font-bold text-lg text-gray-800">
                      {calendarMonth.getFullYear()}年 {calendarMonth.getMonth() + 1}月
                    </h3>
                    <button onClick={() => { const d = new Date(calendarMonth); d.setMonth(d.getMonth() + 1); setCalendarMonth(d); }} className="p-1 hover:bg-gray-100 rounded-full"><ChevronRight size={20} /></button>
                  </div>

                  <div className="grid grid-cols-7 text-center mb-2">
                    {['日', '一', '二', '三', '四', '五', '六'].map(d => (
                      <span key={d} className="text-xs font-bold text-gray-400">{d}</span>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: getDaysInMonth(calendarMonth.getFullYear(), calendarMonth.getMonth()) + getFirstDayOfMonth(calendarMonth.getFullYear(), calendarMonth.getMonth()) }).map((_, i) => {
                      const firstDay = getFirstDayOfMonth(calendarMonth.getFullYear(), calendarMonth.getMonth());
                      if (i < firstDay) return <div key={`empty-${i}`} className="aspect-square"></div>;
                      
                      const day = i - firstDay + 1;
                      const dateStr = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const isSelected = dateStr === calendarSelectedDate;
                      const isToday = dateStr === getTodayString();
                      
                      const dayTasks = currentCycleTasks.filter(t => t.date === dateStr);

                      return (
                        <div 
                          key={day} 
                          onClick={() => setCalendarSelectedDate(dateStr)}
                          className={`aspect-square rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all relative border 
                            ${isSelected ? 'border-[#28C8C8] bg-[#28C8C8]/10' : 'border-transparent hover:bg-gray-50'}
                            ${isToday && !isSelected ? 'bg-orange-50 text-orange-600 font-bold' : ''}
                          `}
                        >
                          <span className={`text-sm ${isSelected ? 'font-bold text-[#28C8C8]' : 'text-gray-700'}`}>{day}</span>
                          <div className="flex gap-0.5 mt-1">
                            {dayTasks.slice(0, 3).map((t, idx) => (
                              <div 
                                key={idx} 
                                className={`w-1.5 h-1.5 rounded-full 
                                  ${t.status === 'done' ? 'bg-green-300' : t.status === 'open' ? 'bg-red-500' : 'bg-[#28C8C8]/50'}
                                `}
                              ></div>
                            ))}
                            {dayTasks.length > 3 && <div className="w-1.5 h-1.5 rounded-full bg-gray-300"></div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                    <Clock size={16} /> {calendarSelectedDate} 的任務
                  </h4>
                  
                  <div className="space-y-3">
                    {currentCycleTasks.filter(t => t.date === calendarSelectedDate).length === 0 ? (
                      <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-400 text-sm border border-dashed border-gray-200">
                        這一天沒有安排任何任務 😴
                      </div>
                    ) : (
                      currentCycleTasks.filter(t => t.date === calendarSelectedDate).map(task => {
                        const isMine = task.currentHolderId === currentUser?.id;
                        const isOpen = task.status === 'open';
                        const isDone = task.status === 'done';
                        const isTaskFuture = isFutureDate(task.date);

                        return (
                          <div key={task.id} className={`bg-white p-4 rounded-xl border shadow-sm flex items-center justify-between ${isDone ? 'opacity-70' : ''}`}>
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{task.icon}</span>
                              <div>
                                <h5 className={`font-bold ${isDone ? 'line-through text-gray-400' : 'text-gray-800'}`}>{task.name}</h5>
                                {!isDone && (
                                  <div className="flex items-center gap-2 mt-1">
                                    {isOpen ? (
                                      <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded font-bold">急救中 ${task.price}</span>
                                    ) : (
                                      <div className="flex items-center gap-1 text-xs text-gray-500">
                                        <div className={`w-3 h-3 rounded-full ${getUserAvatar(task.currentHolderId)}`}></div>
                                        {getUserName(task.currentHolderId)}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            <div>
                              {isOpen && (
                                <button onClick={() => claimBounty(task.id)} className="bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm">接單</button>
                              )}
                              {!isOpen && !isDone && isMine && (
                                <div className="flex gap-2">
                                  <button onClick={() => releaseTask(task.id)} className="text-xs text-gray-400 underline">釋出</button>
                                  <button 
                                    onClick={() => completeTask(task.id)} 
                                    disabled={isTaskFuture}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors 
                                      ${isTaskFuture 
                                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                                        : 'bg-[#28C8C8] hover:bg-[#20a0a0] text-white'
                                      }`}
                                  >
                                    {isTaskFuture ? '未開放' : '完成'}
                                  </button>
                                </div>
                              )}
                              {isDone && <CheckCircle2 className="text-green-400" size={20} />}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
            
            <div className="mt-6 flex justify-center pb-20">
               <button onClick={dispatchTasksFromConfig} className="text-xs text-gray-400 hover:text-[#28C8C8] flex items-center gap-1">
                 <Play size={10} /> 重置並模擬排班
               </button>
            </div>
          </div>
        )}

        {/* VIEW: WALLET */}
        {view === 'wallet' && (
          <div className="animate-fade-in">
             <div className="bg-gradient-to-br from-[#28C8C8] to-[#1facac] rounded-2xl p-6 text-white shadow-xl mb-6">
               <div className="flex justify-between items-start">
                 <div>
                   <p className="text-white/80 text-sm mb-1">我的本月收支</p>
                   <h2 className={`text-4xl font-bold font-mono text-white`}>
                     {currentUser.balance > 0 ? '+' : ''}{currentUser.balance}
                   </h2>
                 </div>
                 <div className="bg-white/20 p-2 rounded-lg"><Wallet className="text-white" /></div>
               </div>
               <p className="text-xs text-white/70 mt-4 pt-4 border-t border-white/20">* 正數代表月底你會「收到」錢<br/>* 負數代表月底你要「支付」錢</p>
             </div>

             {/* 確保結算建議顯示 */}
             {calculateSettlements().length > 0 && (
               <div className="mb-6">
                 <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                   <AlertCircle size={18} className="text-[#28C8C8]" /> 結算建議
                 </h3>
                 <div className="space-y-3">
                   {calculateSettlements().map((s, idx) => (
                     <div key={idx} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                       <div className="text-sm">
                         <span className="font-bold text-gray-700">{s.fromName}</span> 
                         <span className="text-gray-400 mx-1">➜</span>
                         <span className="font-bold text-gray-700">{s.toName}</span>
                         <div className="text-red-500 font-bold mt-1">需支付 ${s.amount}</div>
                       </div>
                       <button 
                         onClick={() => executeSettlement(s.fromId, s.toId, s.amount)}
                         className="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100 flex items-center gap-1"
                       >
                         <Check size={14} /> 點擊還清
                       </button>
                     </div>
                   ))}
                 </div>
               </div>
             )}

             <h3 className="font-bold text-gray-800 mb-3">全員餘額表</h3>
             <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y">
               {users.map(u => (
                 <div key={u.id} className="flex justify-between items-center p-4">
                   <div className="flex items-center gap-3">
                     <div className={`w-10 h-10 rounded-full ${u.avatar} flex items-center justify-center text-white text-sm font-bold shadow-sm`}>{u.name[0]}</div>
                     <span className="font-medium text-gray-700">{u.name}</span>
                   </div>
                   <div className="text-right">
                     <span className={`font-mono font-bold block text-xl ${u.balance >= 0 ? 'text-[#28C8C8]' : 'text-red-500'}`}>
                       {u.balance > 0 ? '+' : ''}{u.balance}
                     </span>
                     <span className="text-[10px] text-gray-400">新台幣</span>
                   </div>
                 </div>
               ))}
             </div>
          </div>
        )}

        {/* VIEW: SETTINGS */}
        {view === 'settings' && (
          <div className="animate-fade-in">
            {/* 室友管理區塊 */}
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-gray-800 flex items-center gap-2">
                  <Users size={18} /> 室友名單管理
                </h2>
                {!isAddingUser && (
                  <button onClick={() => setIsAddingUser(true)} className="text-xs bg-[#28C8C8]/10 text-[#28C8C8] px-3 py-1.5 rounded-full font-bold flex items-center gap-1 hover:bg-[#28C8C8]/20">
                    <UserPlus size={14} /> 新增
                  </button>
                )}
              </div>

              {isAddingUser && (
                <div className="mb-4 bg-gray-50 p-4 rounded-xl border border-[#28C8C8]/20 animate-fade-in">
                  <h3 className="text-sm font-bold text-gray-700 mb-3">新增一位室友</h3>
                  <div className="space-y-3">
                    <input 
                      type="text" 
                      placeholder="室友名字" 
                      value={userForm.name} 
                      onChange={e => setUserForm({...userForm, name: e.target.value})} 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-[#28C8C8]"
                    />
                    <div>
                      <label className="text-xs text-gray-500 mb-2 block">選擇代表色</label>
                      <div className="flex gap-2 flex-wrap">
                        {AVATAR_COLORS.map(color => (
                          <button 
                            key={color}
                            onClick={() => setUserForm({...userForm, avatar: color})}
                            className={`w-8 h-8 rounded-full ${color} transition-transform hover:scale-110 ${userForm.avatar === color ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''}`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button onClick={() => setIsAddingUser(false)} className="flex-1 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-600">取消</button>
                      <button onClick={saveUser} disabled={!userForm.name.trim()} className="flex-1 py-2 bg-[#28C8C8] hover:bg-[#20a0a0] text-white rounded-lg text-sm font-bold disabled:bg-gray-300">確認新增</button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-4 gap-2">
                {users.map(u => (
                  <div key={u.id} className="flex flex-col items-center p-2 rounded-lg bg-gray-50/50 hover:bg-gray-50 relative group border border-transparent hover:border-gray-200">
                    <div className={`w-12 h-12 rounded-full ${u.avatar} flex items-center justify-center text-white font-bold mb-1 shadow-sm`}>
                      {u.name[0]}
                    </div>
                    <span className="text-xs text-gray-600 text-center truncate w-full">{u.name}</span>
                    
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        confirmDeleteUser(u.id); 
                      }}
                      className="absolute -top-2 -right-2 bg-white text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full w-7 h-7 flex items-center justify-center shadow-md border border-gray-200 z-10 active:scale-90 transition-all"
                      title="刪除室友"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* 家務規則設定 */}
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm mb-6">
              <h2 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
                <Settings size={18} /> 家務規則設定
              </h2>
              <p className="text-xs text-gray-500 leading-relaxed mb-4">
                設定好項目與價格，系統每週會自動產生值日表。
              </p>

              <div className="space-y-2">
                {taskConfigs.map(config => (
                  <div key={config.id} className="flex items-center justify-between py-3 border-b border-gray-50 hover:bg-gray-50 px-2 rounded-lg transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{config.icon}</span>
                      <div>
                        <div className="font-bold text-gray-800 text-sm">{config.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5 flex gap-2">
                          <span>{config.freq}</span>
                          <span className="text-red-400">${config.price}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 items-center">
                      <button onClick={() => openEditor(config)} className="text-gray-400 hover:text-[#28C8C8] p-1.5 rounded-full hover:bg-[#28C8C8]/10">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); confirmDeleteTaskConfig(config.id); }} className="text-gray-400 hover:text-red-600 p-1.5 rounded-full hover:bg-red-50">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
                <button onClick={() => openEditor()} className="w-full py-3 mt-2 border-2 border-dashed border-gray-300 text-gray-400 rounded-xl font-medium flex items-center justify-center gap-2 hover:border-[#28C8C8] hover:text-[#28C8C8] transition-colors bg-white">
                  <Plus size={20} /> 新增規則
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VIEW: SETTINGS EDITOR */}
        {view === 'settings_editor' && (
          <div className="bg-white flex flex-col h-full animate-slide-up">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="font-bold text-xl text-gray-800">{isEditingTask ? '編輯規則' : '新增規則'}</h2>
              <button onClick={closeEditor} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">名稱與圖示</label>
                <div className="flex gap-3">
                  <input type="text" value={editForm.icon} onChange={e => setEditForm({...editForm, icon: e.target.value})} className="w-14 h-12 text-center text-2xl border border-gray-300 rounded-lg outline-none focus:border-[#28C8C8]" />
                  <input type="text" placeholder="例如：倒垃圾" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="flex-1 px-4 border border-gray-300 rounded-lg outline-none focus:border-[#28C8C8]" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <Calendar size={16} /> 下次執行日
                </label>
                <input 
                  type="date"
                  value={editForm.nextDate} 
                  onChange={e => setEditForm({...editForm, nextDate: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none focus:border-[#28C8C8] bg-white"
                />
                <p className="text-xs text-gray-400 mt-1">請指定這個任務「下一次」應該在哪一天執行。</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <User size={16} /> 起始負責人 (誰先開始)
                </label>
                <div className="relative">
                  <select 
                    value={editForm.defaultAssigneeId} 
                    onChange={e => setEditForm({...editForm, defaultAssigneeId: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none focus:border-[#28C8C8] appearance-none bg-white"
                  >
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-4 text-gray-400 pointer-events-none">▼</div>
                </div>
                <p className="text-xs text-gray-400 mt-1">選定後，系統排班將從這位室友開始輪替。</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">代班價格 (NT$)</label>
                <div className="relative">
                  <input 
                    type="number" 
                    min="0"
                    placeholder="30" 
                    value={editForm.price} 
                    onChange={e => {
                      const val = e.target.value;
                      if (val >= 0) {
                        setEditForm({...editForm, price: val});
                      }
                    }} 
                    className="w-full pl-4 pr-4 py-3 border border-gray-300 rounded-lg outline-none focus:border-[#28C8C8] font-mono text-lg [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                  />
                  <div className="absolute right-4 top-3.5 text-gray-400 text-sm pointer-events-none">元</div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">重複頻率</label>
                <div className="flex items-center gap-3 p-2">
                  <span className="text-gray-600">每</span>
                  <input 
                    type="number" 
                    min="1"
                    value={customDays}
                    onChange={(e) => {
                      const val = Math.max(1, Number(e.target.value));
                      setCustomDays(val);
                    }}
                    className="w-24 text-center py-2 border border-gray-300 rounded-lg outline-none focus:border-[#28C8C8] text-lg font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-gray-600">天 一次</span>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 bg-white">
               <button 
                 onClick={saveTaskConfig} 
                 disabled={!isFormValid} 
                 className={`w-full py-4 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2
                   ${isFormValid 
                     ? 'bg-[#28C8C8] text-white shadow-[#28C8C8]/40 hover:bg-[#20a0a0] active:scale-[0.98]' 
                     : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                   }`}
               >
                 <Save size={20} /> 儲存設定
               </button>
            </div>
          </div>
        )}

        {/* VIEW: LOGS */}
        {view === 'history' && (
          <div className="animate-fade-in">
             <h2 className="font-bold text-gray-800 mb-4">系統日誌</h2>
             <div className="space-y-4 border-l-2 border-gray-100 pl-4 ml-2">
               {logs.map(log => (
                 <div key={log.id} className="relative">
                   <div className={`absolute -left-[21px] top-1 w-3 h-3 rounded-full border-2 border-white ${log.type === 'warning' ? 'bg-red-500' : log.type === 'success' ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                   <p className="text-sm text-gray-800">{log.msg}</p>
                   <p className="text-xs text-gray-400">{log.time}</p>
                 </div>
               ))}
             </div>
          </div>
        )}

      </main>

      {/* Tab Bar */}
      {view !== 'settings_editor' && (
        <nav className="bg-white border-t flex justify-around pb-safe pt-1 sticky bottom-0 z-10 shrink-0">
          <TabButton id="roster" label="值日表" icon={CalendarDays} />
          <TabButton id="wallet" label="帳本" icon={Wallet} />
          <TabButton id="settings" label="設定" icon={Settings} />
          <TabButton id="history" label="動態" icon={History} />
        </nav>
      )}

    </div>
  );
}