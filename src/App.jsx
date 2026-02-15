import React, { useState, useEffect } from 'react';
import liff from '@line/liff';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, update, serverTimestamp, remove, push } from "firebase/database";
import { 
  Trash2, Sparkles, Wallet, Users, CheckCircle2, AlertCircle, Clock, 
  Plus, ArrowRight, History, Settings, Edit2, Save, X, Play, 
  CalendarDays, UserPlus, List, ChevronLeft, ChevronRight, User, 
  Calendar, ChevronDown, ChevronUp, Check, Loader2, LogOut
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
// 🛠️ 工具函式
// ==========================================

const getTodayString = () => new Date().toISOString().split('T')[0];
const isFutureDate = (dateStr) => dateStr > getTodayString();
const generateGroupId = () => `rm-${Math.random().toString(36).substr(2, 9)}`;

// ==========================================
// 📱 主應用程式
// ==========================================

export default function RoomieTaskApp() {
  const [loading, setLoading] = useState(true);
  const [isLandingPage, setIsLandingPage] = useState(false);
  const [groupId, setGroupId] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  
  const [users, setUsers] = useState([]);
  const [taskConfigs, setTaskConfigs] = useState([]);
  const [currentCycleTasks, setCurrentCycleTasks] = useState([]);
  const [logs, setLogs] = useState([]);

  const [view, setView] = useState('roster');
  const [rosterViewMode, setRosterViewMode] = useState('list');
  const [isMyTasksOpen, setIsMyTasksOpen] = useState(true);
  const [isTaskListOpen, setIsTaskListOpen] = useState(true);

  // 編輯模式狀態
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
          name: profile.displayName,
          avatar: profile.pictureUrl
        };
        setCurrentUser(lineUser);

        const params = new URLSearchParams(window.location.search);
        const gId = params.get('g');

        if (!gId) {
          setIsLandingPage(true);
          setLoading(false);
          return;
        }

        setGroupId(gId);

        const groupRef = ref(db, `groups/${gId}`);
        onValue(groupRef, (snapshot) => {
          const data = snapshot.val();
          if (data) {
            setUsers(data.users ? Object.values(data.users) : []);
            setTaskConfigs(data.taskConfigs ? Object.values(data.taskConfigs) : []);
            
            const tasksList = data.tasks ? Object.values(data.tasks) : [];
            tasksList.sort((a, b) => a.date.localeCompare(b.date));
            setCurrentCycleTasks(tasksList);
            
            // 日誌反向排序 (最新的在上面)
            const logsList = data.logs ? Object.values(data.logs) : [];
            setLogs(logsList.sort((a, b) => b.id - a.id));

            if (!data.users || !data.users[lineUser.id]) {
              registerNewMember(gId, lineUser);
            }
          } else {
            setIsLandingPage(true);
          }
          setLoading(false);
        });

      } catch (err) {
        console.error("Init Error:", err);
        setLoading(false);
      }
    };
    initApp();
  }, []);

  // ==========================================
  // ✍️ Firebase Actions
  // ==========================================

  const registerNewMember = async (gId, user) => {
    await set(ref(db, `groups/${gId}/users/${user.id}`), {
      ...user, balance: 0, joinedAt: serverTimestamp()
    });
    addLog(gId, `👋 歡迎新室友 ${user.name} 加入！`, 'success');
  };

  const handleCreateGroup = async () => {
    setLoading(true);
    const newGid = generateGroupId();
    const groupRef = ref(db, `groups/${newGid}`);
    
    const initialData = {
      metadata: { creator: currentUser.name, createdAt: serverTimestamp() },
      users: { [currentUser.id]: { ...currentUser, balance: 0 } },
      taskConfigs: {}, // 初始為空，讓用戶自己加
      logs: { [Date.now()]: { id: Date.now(), msg: `🏠 空間已由 ${currentUser.name} 建立`, type: 'info', time: new Date().toLocaleTimeString() } }
    };

    await set(groupRef, initialData);
    // 使用 LIFF URL 跳轉，確保參數正確
    window.location.href = `https://liff.line.me/${LIFF_ID}?g=${newGid}`;
  };

  const handleLeaveGroup = () => {
    // 清除網址參數，回到 Landing Page
    const liffUrl = `https://liff.line.me/${LIFF_ID}`;
    window.location.href = liffUrl;
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
    const inviteLink = `https://liff.line.me/${LIFF_ID}?g=${groupId}`;
    if (liff.isApiAvailable('shareTargetPicker')) {
      await liff.shareTargetPicker([{
        type: "text", text: `🏠 邀請你加入我們的家事值日生群組！\n點擊連結加入排班與記帳：\n${inviteLink}`
      }]);
    } else {
      navigator.clipboard.writeText(inviteLink);
      alert("連結已複製！");
    }
  };

  // --- 設定相關 Action ---
  const saveConfig = async () => {
    if (!configForm.name) return;
    
    const configId = editingConfigId || `cfg-${Date.now()}`;
    const updates = {};
    updates[`groups/${groupId}/taskConfigs/${configId}`] = {
      id: configId,
      ...configForm,
      freq: `每 ${configForm.freq} 天` // 存回字串格式以符合顯示
    };

    await update(ref(db), updates);
    setIsEditingConfig(false);
    setEditingConfigId(null);
    addLog(groupId, `🛠️ ${currentUser.name} 更新了家事規則: ${configForm.name}`, 'info');
  };

  const deleteConfig = async (configId) => {
    if(!window.confirm("確定要刪除這個規則嗎？")) return;
    await remove(ref(db, `groups/${groupId}/taskConfigs/${configId}`));
  };

  const openConfigEditor = (config = null) => {
    if (config) {
      setEditingConfigId(config.id);
      setConfigForm({
        name: config.name,
        price: config.price,
        freq: parseInt(config.freq.match(/\d+/)[0]) || 7, // 解析 "每 7 天" -> 7
        icon: config.icon,
        defaultAssigneeId: config.defaultAssigneeId || currentUser.id,
        nextDate: config.nextDate || getTodayString()
      });
    } else {
      setEditingConfigId(null);
      setConfigForm({ name: '', price: 30, freq: 7, icon: '🧹', defaultAssigneeId: currentUser.id, nextDate: getTodayString() });
    }
    setIsEditingConfig(true);
  };

  // 手動產生任務 (基於 Config) - 這是簡易版排班器
  const generateTasksFromConfig = async () => {
    if(taskConfigs.length === 0) return alert("請先設定家事規則！");
    if(!window.confirm("確定要根據規則產生下週任務嗎？")) return;

    const updates = {};
    const newTasks = [];

    taskConfigs.forEach(cfg => {
       const taskId = `task-${cfg.id}-${Date.now()}`; // 簡單 ID
       const days = parseInt(cfg.freq.match(/\d+/)[0]) || 7;
       
       // 找出下一個輪值的人 (這裡是簡化版，隨機或依序)
       // 真實排班需要紀錄上次是誰，這裡先用 default
       const assigneeId = cfg.defaultAssigneeId;

       updates[`groups/${groupId}/tasks/${taskId}`] = {
         id: taskId,
         configId: cfg.id,
         name: cfg.name,
         price: cfg.price,
         icon: cfg.icon,
         date: getTodayString(), // 預設產生今天的
         status: 'pending',
         currentHolderId: assigneeId
       };
    });

    await update(ref(db), updates);
    addLog(groupId, `📅 ${currentUser.name} 產生了新的排班任務`, 'info');
  };

  // ==========================================
  // 🖼️ UI 渲染
  // ==========================================

  if (loading) return (
    <div className="flex flex-col h-[100dvh] items-center justify-center bg-gray-50">
      <Loader2 className="animate-spin text-[#28C8C8] mb-4" size={48} />
      <p className="text-gray-500 font-medium">載入中...</p>
    </div>
  );

  if (isLandingPage) return (
    <div className="flex flex-col items-center justify-center h-[100dvh] p-8 bg-white text-center">
      <div className="w-24 h-24 bg-[#28C8C8]/10 rounded-full flex items-center justify-center mb-8 animate-bounce">
        <Sparkles size={48} className="text-[#28C8C8]" />
      </div>
      <h1 className="text-3xl font-bold text-gray-800 mb-4">Roomie Task</h1>
      <p className="text-gray-500 mb-10 leading-relaxed">建立空間並邀請室友，開始自動排班與獎勵機制。</p>
      <button onClick={handleCreateGroup} className="w-full max-w-xs py-4 bg-[#28C8C8] text-white rounded-2xl font-bold shadow-xl shadow-[#28C8C8]/30 flex items-center justify-center gap-2">
        <Plus size={20} /> 建立新空間
      </button>
    </div>
  );

  // 編輯器 Modal
  if (isEditingConfig) return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col animate-slide-up">
      <div className="p-4 border-b flex justify-between items-center">
        <h2 className="font-bold text-lg">{editingConfigId ? '編輯規則' : '新增規則'}</h2>
        <button onClick={() => setIsEditingConfig(false)}><X size={24} /></button>
      </div>
      <div className="p-6 space-y-6 flex-1 overflow-y-auto">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">名稱與圖示</label>
          <div className="flex gap-2">
             <input type="text" value={configForm.icon} onChange={e => setConfigForm({...configForm, icon: e.target.value})} className="w-12 h-12 text-center text-2xl border rounded-lg" />
             <input type="text" placeholder="例如：倒垃圾" value={configForm.name} onChange={e => setConfigForm({...configForm, name: e.target.value})} className="flex-1 px-4 border rounded-lg" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">賞金 (NT$)</label>
          <input type="number" value={configForm.price} onChange={e => setConfigForm({...configForm, price: Number(e.target.value)})} className="w-full px-4 py-3 border rounded-lg text-lg font-mono" />
        </div>
        <div>
           <label className="block text-sm font-bold text-gray-700 mb-2">頻率 (天)</label>
           <div className="flex items-center gap-2">
             <span>每</span>
             <input type="number" value={configForm.freq} onChange={e => setConfigForm({...configForm, freq: Number(e.target.value)})} className="w-20 text-center py-2 border rounded-lg" />
             <span>天一次</span>
           </div>
        </div>
        <div>
           <label className="block text-sm font-bold text-gray-700 mb-2">預設負責人</label>
           <select value={configForm.defaultAssigneeId} onChange={e => setConfigForm({...configForm, defaultAssigneeId: e.target.value})} className="w-full px-4 py-3 border rounded-lg bg-white">
             {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
           </select>
        </div>
      </div>
      <div className="p-4 border-t">
        <button onClick={saveConfig} className="w-full py-4 bg-[#28C8C8] text-white rounded-xl font-bold text-lg shadow-lg">儲存設定</button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 flex flex-col bg-gray-50 max-w-md mx-auto border-x overflow-hidden h-[100dvh]">
      <header className="flex-none bg-white px-4 py-4 border-b flex justify-between items-center z-10">
        <div>
           <h1 className="font-bold text-gray-800 text-lg">家事值日生</h1>
           <span className="text-[10px] text-gray-400 font-mono">ID: {groupId.split('-')[1]}</span>
        </div>
        <div className="flex items-center gap-2 bg-gray-100 rounded-full pl-1 pr-3 py-1">
          <img src={currentUser?.avatar} className="w-6 h-6 rounded-full" alt="me" />
          <span className="text-xs font-bold text-gray-700 truncate max-w-[80px]">{currentUser?.name}</span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
        {view === 'roster' && (
          <div className="space-y-4 animate-fade-in">
            <div className="bg-gradient-to-r from-[#28C8C8] to-[#20a0a0] rounded-2xl p-4 text-white shadow-lg mb-2 flex justify-between items-center">
              <div><h3 className="font-bold">邀請室友</h3><p className="text-xs opacity-80">讓大家加入此群組</p></div>
              <button onClick={shareInvite} className="bg-white text-[#28C8C8] p-2 rounded-full"><UserPlus size={20}/></button>
            </div>

            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button onClick={() => setRosterViewMode('list')} className={`flex-1 py-2 rounded-lg text-sm font-bold ${rosterViewMode === 'list' ? 'bg-white text-[#28C8C8] shadow-sm' : 'text-gray-500'}`}>清單</button>
              <button onClick={() => setRosterViewMode('calendar')} className={`flex-1 py-2 rounded-lg text-sm font-bold ${rosterViewMode === 'calendar' ? 'bg-white text-[#28C8C8] shadow-sm' : 'text-gray-500'}`}>日曆</button>
            </div>

            {rosterViewMode === 'list' && (
              <>
                <div>
                  <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2"><CheckCircle2 size={18} className="text-[#28C8C8]"/> 我的待辦</h3>
                  <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    {currentCycleTasks.filter(t => t.currentHolderId === currentUser?.id && t.status === 'pending').length === 0 ? 
                      <div className="p-6 text-center text-gray-400 text-sm">無待辦事項 🎉</div> : 
                      currentCycleTasks.filter(t => t.currentHolderId === currentUser?.id && t.status === 'pending').map(task => (
                        <div key={task.id} className="p-4 flex items-center justify-between border-b last:border-0">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{task.icon}</span>
                            <div><h4 className="font-bold text-gray-800 text-sm">{task.name}</h4><span className="text-[10px] bg-red-100 text-red-500 px-1 rounded">{task.date}</span></div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => releaseTaskToBounty(task)} className="px-3 py-1 bg-gray-100 text-xs font-bold rounded text-gray-500">沒空</button>
                            <button onClick={() => completeTask(task)} className="px-3 py-1 bg-[#28C8C8] text-xs font-bold rounded text-white">完成</button>
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2"><Users size={18} className="text-gray-400"/> 任務列表</h3>
                  <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    {currentCycleTasks.map(task => {
                      const isOpen = task.status === 'open';
                      const isDone = task.status === 'done';
                      return (
                        <div key={task.id} className={`p-4 flex items-center justify-between border-b last:border-0 ${isOpen ? 'bg-red-50' : ''}`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDone ? 'opacity-30' : 'bg-gray-50'}`}>{task.icon}</div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className={`font-bold text-sm ${isDone ? 'line-through text-gray-300' : 'text-gray-800'}`}>{task.name}</h4>
                                {isOpen && <span className="text-[10px] bg-red-500 text-white px-1 rounded animate-pulse">賞金</span>}
                              </div>
                              <span className="text-[10px] text-gray-400">{task.date}</span>
                            </div>
                          </div>
                          {isOpen ? <button onClick={() => claimBountyTask(task)} className="bg-red-500 text-white px-2 py-1 rounded text-xs font-bold">接單 +${task.price}</button> : isDone ? <CheckCircle2 className="text-green-300" size={18}/> : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
            
            {rosterViewMode === 'calendar' && <div className="text-center py-20 text-gray-400 text-sm">日曆功能開發中...</div>}
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
               <div className="flex justify-between items-center mb-4">
                 <h3 className="font-bold text-gray-800 flex items-center gap-2"><Settings size={18}/> 家事規則</h3>
                 <button onClick={() => openConfigEditor()} className="text-xs bg-[#28C8C8]/10 text-[#28C8C8] px-2 py-1 rounded font-bold">+ 新增</button>
               </div>
               <div className="space-y-2">
                 {taskConfigs.length === 0 ? <p className="text-gray-400 text-xs text-center py-4">還沒設定規則</p> : 
                   taskConfigs.map(cfg => (
                     <div key={cfg.id} className="flex justify-between items-center p-2 hover:bg-gray-50 rounded">
                       <div className="flex items-center gap-3">
                         <span className="text-xl">{cfg.icon}</span>
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
               <button onClick={generateTasksFromConfig} className="w-full mt-4 py-2 border border-dashed border-gray-300 text-gray-500 text-xs rounded-lg hover:border-[#28C8C8] hover:text-[#28C8C8] flex items-center justify-center gap-1">
                 <Play size={12}/> 手動產生本週任務 (測試用)
               </button>
             </div>

             <div className="text-center pt-8 pb-4">
               <button onClick={handleLeaveGroup} className="text-gray-400 text-xs underline flex items-center justify-center gap-1 w-full hover:text-red-500">
                 <LogOut size={12}/> 離開此群組 (建立新群組)
               </button>
               <p className="text-[10px] text-gray-300 mt-2">Group ID: {groupId}</p>
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