import { Link, useLocation } from 'react-router-dom';

interface SidebarProps {
  onSystemStatusClick: () => void;
}

export default function Sidebar({ onSystemStatusClick }: SidebarProps) {
  const location = useLocation();

  const menuItems = [
    { path: '/dashboard', icon: 'ri-dashboard-line', label: '대시보드' },
    { path: '/deploy', icon: 'ri-upload-cloud-line', label: '함수 배포' },
    { path: '/logs', icon: 'ri-file-list-line', label: '실행 로그' },
    { path: '/settings', icon: 'ri-settings-3-line', label: '설정' },
  ];

  return (
    <aside className="w-64 bg-white/60 backdrop-blur-md border-r border-gray-200 flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <Link to="/" className="flex items-center gap-2 cursor-pointer">
          <div className="w-10 h-10 flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
            <i className="ri-flashlight-fill text-white text-xl"></i>
          </div>
          <span className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>FaaS Platform</span>
        </Link>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => (
            <li key={item.path}>
              <Link
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer ${location.pathname === item.path
                  ? 'bg-blue-50 text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:bg-blue-50'
                  }`}
              >
                <i className={`${item.icon} text-xl`}></i>
                <span className="font-medium text-sm">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* System Status Widget */}
      <div className="p-4 border-t border-gray-200">
        <button
          onClick={onSystemStatusClick}
          className="w-full bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border border-gray-200 hover:border-blue-300 transition-all cursor-pointer text-left"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              ⚡ System Status
            </span>
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          </div>

          {/* Python */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-600">Python 3.11</span>
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full ${i < 3
                    ? 'bg-gradient-to-br from-blue-400 to-purple-400 animate-pulse'
                    : 'bg-gray-300'
                    }`}
                  style={{
                    animationDelay: `${i * 200}ms`,
                    animationDuration: '2s'
                  }}
                />
              ))}
              <span className="text-xs text-gray-500 ml-1">(3)</span>
            </div>
          </div>

          {/* Node.js */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-600">Node.js 20</span>
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full ${i < 2
                    ? 'bg-gradient-to-br from-blue-400 to-purple-400 animate-pulse'
                    : 'bg-gray-300'
                    }`}
                  style={{
                    animationDelay: `${i * 200}ms`,
                    animationDuration: '2s'
                  }}
                />
              ))}
              <span className="text-xs text-gray-500 ml-1">(2)</span>
            </div>
          </div>

          {/* C++ / Go */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-600">C++ / Go</span>
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full ${i < 1
                    ? 'bg-gradient-to-br from-blue-400 to-purple-400 animate-pulse'
                    : 'bg-gray-300'
                    }`}
                  style={{
                    animationDelay: `${i * 200}ms`,
                    animationDuration: '2s'
                  }}
                />
              ))}
              <span className="text-xs text-gray-500 ml-1">(1)</span>
            </div>
          </div>

          <div className="pt-3 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <i className="ri-settings-4-line text-green-600"></i>
              <span className="text-xs font-semibold text-green-600">Auto-Tuner: Active</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Saving Mode</p>
          </div>
        </button>
      </div>
    </aside>
  );
}
