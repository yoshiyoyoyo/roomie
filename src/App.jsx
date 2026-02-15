import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, set, serverTimestamp, update, onValue } from "firebase/database";
import { 
  Plus, Home, ChevronRight, Users, CheckCircle2, 
  Wallet, Settings, History, LogOut, Loader2, X, Send
} from 'lucide-react';

// --- 配置區 ---
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

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [myGroups, setMyGroups] = useState([]); // 本地儲存的群組
  const [currentGroupId, setCurrentGroupId] = useState(null);
  const [groupData, setGroupData] = useState(null);
  const [view, setView] = useState('roster'); // roster, wallet, history, settings
  
  // UI 狀態
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  // 1. 初始化 LIFF 與 用戶
  useEffect(() => {
    const init = async () => {
      try {
        await window.liff.init({ liffId: LIFF_ID });
        if (!window.liff.isLoggedIn()) {
          window.liff.login();
          return;
        }
        const profile = await window.liff.getProfile();
        setUser({ id: profile.userId, name: profile.displayName, avatar: profile.pictureUrl });
        
        // 讀取本地紀錄
        const saved = JSON.parse(localStorage.getItem('roomie_history') || '[]');
        setMyGroups(saved);

        // 檢查網址是否有群組 ID (?g=xxx)
        const params = new URLSearchParams(window.location.search);
        const gId = params.get('g');
        if (gId) {
          loadGroup(gId, profile.userId, profile.displayName, profile.pictureUrl);
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error("Init Error", err);
        setLoading(false);
      }
    };
    init();
  }, []);

  // 2. 載入群組資料
  const loadGroup = async (gId, uId, uName, uAvatar) => {
    setLoading(true);
    try {
      const groupRef = ref(db, `groups/${gId}`);
      const snapshot = await get(groupRef);
      
      if (snapshot.exists()) {
        const data = snapshot.val();
        setGroupData(data);
        setCurrentGroupId(gId);
        
        // 存入本地歷史
        const history = JSON.parse(localStorage.getItem('roomie_history') || '[]');
        if (!history.find(h => h.id === gId)) {
          const newHistory = [{ id: gId, name: data.name || '未命名空間' }, ...history].slice(0, 5);
          localStorage.setItem('roomie_history', JSON.stringify(newHistory));
          setMyGroups(newHistory);
        }

        // 如果我不在成員名單，自動加入
        if (!data.members || !data.members[uId]) {
          await update(ref(db, `groups/${gId}/members/${uId}`), {
            id: uId, name: uName, avatar: uAvatar, balance: 0
          });
        }

        // 開啟監聽
        onValue(groupRef, (snap) => setGroupData(snap.val()));
      } else {
        alert("找不到此群組");
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch (e) {
      alert("連線失敗");
    }
    setLoading(false);
  };

  // 3. 建立新群組流程
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setLoading(true);
    const newId = `g-${Math.random().toString(36).substr(2, 9)}`;
    try {
      const newGroup = {
        id: newId,
        name: newGroupName,
        createdAt: serverTimestamp(),
        members: {
          [user.id]: { id: user.id, name: user.name, avatar: user.avatar, balance: 0 }
        },
        tasks: {},
        logs: [{ time: new Date().toLocaleString(), msg: `🏠 ${user.name} 建立了空間` }]
      };
      await set(ref(db, `groups/${newId}`), newGroup);
      setShowCreateModal(false);
      // 直接進入新群組網址
      window.location.href = `https://liff.line.me/${LIFF_ID}?g=${newId}`;
    } catch (e) {
      alert("建立失敗");
      setLoading(false);
    }
  };

  // 4. 分享連結
  const handleShare = async () => {
    const link = `https://liff.line.me/${LIFF_ID}?g=${currentGroupId}`;
    if (window.liff.isApiAvailable('shareTargetPicker')) {
      await window.liff.shareTargetPicker([{
        type: "text",
        text: `🏠 邀請你加入我們的空間「${groupData.name}」！\n點擊連結進入：\n${link}`
      }]);
    }
  };

  // --- UI 元件 ---

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <Loader2 className="animate-spin text-cyan-500" size={40} />
    </div>
  );

  // 首頁：群組列表
  if (!currentGroupId) return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto flex flex-col">
      <div className="p-8 bg-white border-b shadow-sm">
        <h1 className="text-2xl font-bold text-gray-800">嗨，{user?.name}</h1>
        <p className="text-gray-500">選擇空間或建立一個新的</p>
      </div>

      <div className="flex-1 p-4 space-y-4">
        {myGroups.map(g => (
          <div key={g.id} onClick={() => window.location.href = `https://liff.line.me/${LIFF_ID}?g=${g.id}`}
               className="bg-white p-4 rounded-2xl border flex justify-between items-center shadow-sm active:scale-95 transition-transform">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-cyan-100 rounded-full flex items-center justify-center text-cyan-600"><Home size={20}/></div>
              <span className="font-bold text-gray-700">{g.name}</span>
            </div>
            <ChevronRight className="text-gray-300" />
          </div>
        ))}
        {myGroups.length === 0 && <div className="text-center py-20 text-gray-400 text-sm">尚未加入任何空間</div>}
      </div>

      <div className="p-6 bg-white border-t">
        <button onClick={() => setShowCreateModal(true)} 
                className="w-full py-4 bg-cyan-500 text-white rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2">
          <Plus size={20}/> 建立新空間
        </button>
      </div>

      {/* 命名彈窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-50">
          <div className="bg-white w-full rounded-3xl p-6 space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">為你的空間命名</h3>
              <X onClick={() => setShowCreateModal(false)} className="text-gray-400" />
            </div>
            <input autoFocus type="text" placeholder="例如：我的溫馨小家" 
                   value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                   className="w-full p-4 bg-gray-100 rounded-2xl border-none focus:ring-2 focus:ring-cyan-500" />
            <button onClick={handleCreateGroup} className="w-full py-4 bg-cyan-500 text-white rounded-2xl font-bold">確認建立</button>
          </div>
        </div>
      )}
    </div>
  );

  // 群組內部頁面
  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto flex flex-col pb-20">
      <header className="p-4 bg-white border-b flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-2" onClick={() => window.location.href = `https://liff.line.me/${LIFF_ID}`}>
          <ChevronRight className="rotate-180 text-gray-400" />
          <h2 className="font-bold text-gray-800">{groupData?.name}</h2>
        </div>
        <img src={user?.avatar} className="w-8 h-8 rounded-full border" alt="me" />
      </header>

      <main className="p-4 flex-1">
        {view === 'roster' && (
          <div className="space-y-6">
            <div className="bg-white p-4 rounded-2xl border shadow-sm space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-bold flex items-center gap-2"><Users size={18}/> 空間成員</h3>
                <button onClick={handleShare} className="text-xs text-cyan-500 font-bold bg-cyan-50 px-3 py-1 rounded-full">+ 邀請</button>
              </div>
              <div className="flex -space-x-2 overflow-hidden">
                {groupData?.members && Object.values(groupData.members).map(m => (
                  <img key={m.id} src={m.avatar} title={m.name} className="w-10 h-10 rounded-full border-2 border-white bg-gray-200" />
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border shadow-sm p-4 min-h-[200px] flex flex-col items-center justify-center text-gray-400 space-y-2">
              <CheckCircle2 size={40} className="opacity-20" />
              <p className="text-sm">今日尚無任務</p>
              <p className="text-xs">請點擊下方「設定」來新增家事規則</p>
            </div>
          </div>
        )}

        {view === 'wallet' && (
          <div className="space-y-4">
            <div className="bg-cyan-500 p-6 rounded-3xl text-white shadow-lg">
              <p className="opacity-80 text-sm">我的餘額</p>
              <h1 className="text-4xl font-bold font-mono">NT$ {groupData?.members?.[user.id]?.balance || 0}</h1>
            </div>
          </div>
        )}

        {view === 'history' && (
          <div className="bg-white rounded-2xl border p-4 space-y-4">
             {groupData?.logs?.slice(-10).reverse().map((log, i) => (
               <div key={i} className="flex gap-3 text-sm">
                 <div className="w-1 bg-cyan-100 rounded-full" />
                 <div>
                   <p className="text-gray-500 text-xs">{log.time}</p>
                   <p className="text-gray-800">{log.msg}</p>
                 </div>
               </div>
             ))}
          </div>
        )}

        {view === 'settings' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-2xl border">
               <h3 className="font-bold mb-4">空間設定</h3>
               <button onClick={() => window.location.href = `https://liff.line.me/${LIFF_ID}`}
                       className="w-full py-3 bg-gray-50 text-gray-600 rounded-xl text-sm flex items-center justify-center gap-2">
                 <LogOut size={16}/> 退出並切換空間
               </button>
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around p-2 max-w-md mx-auto">
        <button onClick={() => setView('roster')} className={`flex flex-col items-center p-2 ${view === 'roster' ? 'text-cyan-500' : 'text-gray-400'}`}><CheckCircle2 size={24}/><span className="text-[10px] mt-1">任務</span></button>
        <button onClick={() => setView('wallet')} className={`flex flex-col items-center p-2 ${view === 'wallet' ? 'text-cyan-500' : 'text-gray-400'}`}><Wallet size={24}/><span className="text-[10px] mt-1">帳本</span></button>
        <button onClick={() => setView('history')} className={`flex flex-col items-center p-2 ${view === 'history' ? 'text-cyan-500' : 'text-gray-400'}`}><History size={24}/><span className="text-[10px] mt-1">動態</span></button>
        <button onClick={() => setView('settings')} className={`flex flex-col items-center p-2 ${view === 'settings' ? 'text-cyan-500' : 'text-gray-400'}`}><Settings size={24}/><span className="text-[10px] mt-1">設定</span></button>
      </nav>
    </div>
  );
}