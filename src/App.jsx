import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, set, serverTimestamp, update, onValue } from "firebase/database";
import { 
  Plus, Home, ChevronRight, Users, CheckCircle2, 
  Wallet, Settings, History, LogOut, Loader2, X, RefreshCw
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
  const [myGroups, setMyGroups] = useState([]);
  const [currentGroupId, setCurrentGroupId] = useState(null);
  const [groupData, setGroupData] = useState(null);
  const [view, setView] = useState('roster');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  // 1. 初始化邏輯 (加強版：等待 window.liff 出現)
  useEffect(() => {
    const checkLiff = setInterval(() => {
      if (window.liff) {
        clearInterval(checkLiff);
        initLiff();
      }
    }, 100); // 每 100 毫秒檢查一次 LINE SDK 是否載入
    return () => clearInterval(checkLiff);
  }, []);

  const initLiff = async () => {
    try {
      await window.liff.init({ liffId: LIFF_ID });
      if (!window.liff.isLoggedIn()) {
        window.liff.login();
        return;
      }
      const profile = await window.liff.getProfile();
      setUser({ id: profile.userId, name: profile.displayName, avatar: profile.pictureUrl });
      
      const saved = JSON.parse(localStorage.getItem('roomie_history') || '[]');
      setMyGroups(saved);

      const params = new URLSearchParams(window.location.search);
      const gId = params.get('g');
      if (gId) {
        loadGroup(gId, profile.userId, profile.displayName, profile.pictureUrl);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error("LIFF Init Error", err);
      setLoading(false);
    }
  };

  const loadGroup = async (gId, uId, uName, uAvatar) => {
    setLoading(true);
    try {
      const groupRef = ref(db, `groups/${gId}`);
      const snapshot = await get(groupRef);
      
      if (snapshot.exists()) {
        const data = snapshot.val();
        setGroupData(data);
        setCurrentGroupId(gId);
        
        const history = JSON.parse(localStorage.getItem('roomie_history') || '[]');
        if (!history.find(h => h.id === gId)) {
          const newHistory = [{ id: gId, name: data.name || '未命名空間' }, ...history].slice(0, 5);
          localStorage.setItem('roomie_history', JSON.stringify(newHistory));
          setMyGroups(newHistory);
        }

        if (!data.members || !data.members[uId]) {
          await update(ref(db, `groups/${gId}/members/${uId}`), {
            id: uId, name: uName, avatar: uAvatar, balance: 0
          });
        }
        onValue(groupRef, (snap) => setGroupData(snap.val()));
      } else {
        alert("找不到此群組");
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch (e) {
      console.error("Firebase Load Error", e);
    }
    setLoading(false);
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setLoading(true);
    const newId = `g-${Math.random().toString(36).substr(2, 9)}`;
    try {
      // 關鍵修復：這裡的路徑必須跟 loadGroup 對上
      const newGroupData = {
        id: newId,
        name: newGroupName,
        createdAt: serverTimestamp(),
        members: {
          [user.id]: { id: user.id, name: user.name, avatar: user.avatar, balance: 0 }
        },
        logs: [{ time: new Date().toLocaleString(), msg: `🏠 ${user.name} 建立了空間` }]
      };
      
      await set(ref(db, `groups/${newId}`), newGroupData);
      
      // 更新本地紀錄後跳轉
      const history = JSON.parse(localStorage.getItem('roomie_history') || '[]');
      const newHistory = [{ id: newId, name: newGroupName }, ...history].slice(0, 5);
      localStorage.setItem('roomie_history', JSON.stringify(newHistory));
      
      setShowCreateModal(false);
      window.location.href = `https://liff.line.me/${LIFF_ID}?g=${newId}`;
    } catch (e) {
      console.error("Create Error", e);
      alert("建立失敗，請檢查 Firebase 規則是否已設為 true");
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="flex h-screen flex-col items-center justify-center bg-gray-50">
      <Loader2 className="animate-spin text-cyan-500 mb-2" size={40} />
      <p className="text-gray-400 text-sm italic">正在啟動 LINE 服務...</p>
    </div>
  );

  if (!currentGroupId) return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto flex flex-col">
      <div className="p-8 bg-white border-b shadow-sm">
        <h1 className="text-2xl font-bold text-gray-800">嗨，{user?.name}</h1>
        <p className="text-gray-500">選擇空間或建立一個新的</p>
      </div>
      <div className="flex-1 p-4 space-y-4">
        {myGroups.map(g => (
          <div key={g.id} onClick={() => window.location.href = `https://liff.line.me/${LIFF_ID}?g=${g.id}`}
               className="bg-white p-4 rounded-2xl border flex justify-between items-center shadow-sm active:bg-gray-50">
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
        <button onClick={() => setShowCreateModal(true)} className="w-full py-4 bg-cyan-500 text-white rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2">
          <Plus size={20}/> 建立新空間
        </button>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-50">
          <div className="bg-white w-full rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">為你的空間命名</h3>
              <X onClick={() => setShowCreateModal(false)} className="text-gray-400" />
            </div>
            {/* 加入 id 與 name 解決瀏覽器建議 */}
            <input id="group-name-input" name="groupName" autoFocus type="text" placeholder="例如：我的溫馨小家" 
                   value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                   className="w-full p-4 bg-gray-100 rounded-2xl border-none focus:ring-2 focus:ring-cyan-500 text-lg" />
            <button onClick={handleCreateGroup} className="w-full py-4 bg-cyan-500 text-white rounded-2xl font-bold text-lg active:scale-95 transition-transform">確認建立</button>
          </div>
        </div>
      )}
    </div>
  );

  // 群組內部 UI
  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto flex flex-col pb-20 overflow-hidden">
      <header className="p-4 bg-white border-b flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2" onClick={() => window.location.href = `https://liff.line.me/${LIFF_ID}`}>
          <ChevronRight className="rotate-180 text-gray-400" />
          <h2 className="font-bold text-gray-800 truncate max-w-[180px]">{groupData?.name || '我的空間'}</h2>
        </div>
        <img src={user?.avatar} className="w-8 h-8 rounded-full border shadow-inner" alt="me" />
      </header>
      <main className="p-4 flex-1 overflow-y-auto">
        {view === 'roster' && (
          <div className="space-y-6">
            <div className="bg-white p-4 rounded-2xl border shadow-sm space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-bold flex items-center gap-2 text-gray-700"><Users size={18} className="text-cyan-500"/> 成員列表</h3>
                <button onClick={async () => {
                  const link = `https://liff.line.me/${LIFF_ID}?g=${currentGroupId}`;
                  if (window.liff.isApiAvailable('shareTargetPicker')) {
                    await window.liff.shareTargetPicker([{ type: "text", text: `🏠 邀請你加入空間「${groupData.name}」！\n${link}` }]);
                  }
                }} className="text-xs text-cyan-500 font-bold bg-cyan-50 px-3 py-1.5 rounded-full">+ 邀請</button>
              </div>
              <div className="flex -space-x-2">
                {groupData?.members && Object.values(groupData.members).map(m => (
                  <img key={m.id} src={m.avatar} className="w-10 h-10 rounded-full border-2 border-white bg-gray-100" alt={m.name} />
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl border shadow-sm p-10 flex flex-col items-center justify-center text-gray-400 space-y-2">
              <CheckCircle2 size={48} className="opacity-10" />
              <p className="text-sm font-medium">今日任務已全數完成！</p>
            </div>
          </div>
        )}
        {view === 'wallet' && (
          <div className="bg-cyan-500 p-8 rounded-[32px] text-white shadow-xl shadow-cyan-200">
            <p className="opacity-70 text-sm mb-1">個人結餘</p>
            <h1 className="text-5xl font-bold font-mono">NT$ {groupData?.members?.[user.id]?.balance || 0}</h1>
          </div>
        )}
        {view === 'history' && (
          <div className="bg-white rounded-2xl border p-4 space-y-4">
            <h3 className="font-bold text-gray-700 flex items-center gap-2"><History size={18} className="text-gray-400"/> 最近動態</h3>
            <div className="space-y-4 divide-y">
              {groupData?.logs?.slice(-10).reverse().map((log, i) => (
                <div key={i} className="pt-3">
                  <p className="text-[10px] text-gray-400 font-mono mb-1">{log.time}</p>
                  <p className="text-sm text-gray-700">{log.msg}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {view === 'settings' && (
          <div className="bg-white p-4 rounded-2xl border shadow-sm">
             <h3 className="font-bold mb-4 flex items-center gap-2"><Settings size={18}/> 設定</h3>
             <button onClick={() => window.location.href = `https://liff.line.me/${LIFF_ID}`} className="w-full py-4 bg-red-50 text-red-500 rounded-xl text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-all">
               <LogOut size={16}/> 退出並切換空間
             </button>
          </div>
        )}
      </main>
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t flex justify-around p-2 max-w-md mx-auto shadow-lg">
        {[ {id:'roster', icon:CheckCircle2, label:'任務'}, {id:'wallet', icon:Wallet, label:'帳本'}, {id:'history', icon:History, label:'動態'}, {id:'settings', icon:Settings, label:'設定'} ].map(item => (
          <button key={item.id} onClick={() => setView(item.id)} className={`flex flex-col items-center p-2 transition-colors ${view === item.id ? 'text-cyan-600' : 'text-gray-400'}`}>
            <item.icon size={22} strokeWidth={2.5}/>
            <span className="text-[10px] mt-1 font-bold">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}