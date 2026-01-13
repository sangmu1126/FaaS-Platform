import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

interface SidebarProps {
  onSystemStatusClick?: () => void;
  systemStatus?: any;
}

export default function Sidebar({ systemStatus: externalStatus, onSystemStatusClick }: SidebarProps) {
  const location = useLocation();
  const [internalStatus, setInternalStatus] = useState<any>(null);

  // Fetch system status internally if not provided via props
  useEffect(() => {
    if (externalStatus !== undefined && externalStatus !== null) return; // Use external status if provided

    const fetchStatus = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'}/system/status`);
        if (res.ok) {
          const data = await res.json();
          setInternalStatus(data);
        }
      } catch (e) {
        console.error("Sidebar: Failed to fetch system status");
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [externalStatus]);

  // Use external status if provided, otherwise use internal
  const systemStatus = externalStatus ?? internalStatus;

  const menuItems = [
    { path: '/dashboard', icon: 'ri-dashboard-line', label: '대시보드' },
    { path: '/deploy', icon: 'ri-upload-cloud-line', label: '함수 배포' },
    { path: '/logs', icon: 'ri-file-list-line', label: '실행 로그' },
    { path: '/metrics', icon: 'ri-bar-chart-box-line', label: '모니터링' },
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
            <div className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${systemStatus?.status === 'online' ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
              <span className="text-xs text-gray-500">
                {systemStatus?.status === 'online' ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>

          {/* Worker Uptime */}
          {systemStatus?.uptime_seconds && (
            <div className="flex items-center justify-between mb-2 text-xs">
              <span className="text-gray-600">🏥 Worker Uptime</span>
              <span className="text-green-600 font-medium">
                {Math.floor(systemStatus.uptime_seconds / 3600)}h {Math.floor((systemStatus.uptime_seconds % 3600) / 60)}m
              </span>
            </div>
          )}

          {/* Python */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-600">Python 3.11</span>
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full ${i < (systemStatus?.pools?.python || 0)
                    ? 'bg-gradient-to-br from-blue-400 to-purple-400 animate-pulse'
                    : 'bg-gray-300'
                    }`}
                  style={{
                    animationDelay: `${i * 200}ms`,
                    animationDuration: '2s'
                  }}
                />
              ))}
              <span className="text-xs text-gray-500 ml-1">({systemStatus?.pools?.python || 0})</span>
            </div>
          </div>

          {/* Node.js */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-600">Node.js 20</span>
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full ${i < (systemStatus?.pools?.nodejs || 0)
                    ? 'bg-gradient-to-br from-blue-400 to-purple-400 animate-pulse'
                    : 'bg-gray-300'
                    }`}
                  style={{
                    animationDelay: `${i * 200}ms`,
                    animationDuration: '2s'
                  }}
                />
              ))}
              <span className="text-xs text-gray-500 ml-1">({systemStatus?.pools?.nodejs || 0})</span>
            </div>
          </div>

          {/* C++ */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-600">C++ 17</span>
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full ${i < (systemStatus?.pools?.cpp || 0)
                    ? 'bg-gradient-to-br from-pink-500 to-rose-500 animate-pulse'
                    : 'bg-gray-300'
                    }`}
                  style={{
                    animationDelay: `${i * 200}ms`,
                    animationDuration: '2s'
                  }}
                />
              ))}
              <span className="text-xs text-gray-500 ml-1">({systemStatus?.pools?.cpp || 0})</span>
            </div>
          </div>

          {/* Go */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-600">Go 1.21</span>
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full ${i < (systemStatus?.pools?.go || 0)
                    ? 'bg-gradient-to-br from-cyan-400 to-blue-500 animate-pulse'
                    : 'bg-gray-300'
                    }`}
                  style={{
                    animationDelay: `${i * 200}ms`,
                    animationDuration: '2s'
                  }}
                />
              ))}
              <span className="text-xs text-gray-500 ml-1">({systemStatus?.pools?.go || 0})</span>
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
