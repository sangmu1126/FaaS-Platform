import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../store/authStore';
import { useAlertStore } from '../../../store/alertStore';

interface HeaderProps {
  onSearch?: (query: string) => void;
}

export default function Header({ onSearch }: HeaderProps) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { logout, user } = useAuthStore();
  const { alerts, markAsRead, markAllAsRead } = useAlertStore();

  const unreadCount = alerts.filter(a => !a.read).length;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (alertRef.current && !alertRef.current.contains(event.target as Node)) {
        setIsAlertOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'success': return 'ri-check-line text-green-500';
      case 'error': return 'ri-error-warning-line text-red-500';
      case 'warning': return 'ri-alert-line text-amber-500';
      default: return 'ri-information-line text-blue-500';
    }
  };

  return (
    <header className="bg-white/60 backdrop-blur-md border-b border-gray-200 px-6 py-4 relative z-50">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="relative max-w-md">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg"></i>
            <input
              type="text"
              placeholder="Search functions..."
              onChange={(e) => onSearch?.(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-300 transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Notification Bell */}
          <div className="relative" ref={alertRef}>
            <button
              onClick={() => setIsAlertOpen(!isAlertOpen)}
              className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-50 transition-colors cursor-pointer relative"
            >
              <i className="ri-notification-line text-xl text-gray-600"></i>
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {isAlertOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-50">
                <div className="p-3 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Notifications</h3>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {alerts.length === 0 ? (
                    <div className="p-6 text-center text-gray-500">
                      <i className="ri-notification-off-line text-3xl mb-2"></i>
                      <p className="text-sm">No notifications</p>
                    </div>
                  ) : (
                    alerts.slice(0, 10).map((alert) => (
                      <div
                        key={alert.id}
                        onClick={() => markAsRead(alert.id)}
                        className={`p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${!alert.read ? 'bg-blue-50/50' : ''}`}
                      >
                        <div className="flex items-start gap-3">
                          <i className={`${getAlertIcon(alert.type)} text-lg mt-0.5`}></i>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{alert.title}</p>
                            <p className="text-xs text-gray-500 truncate">{alert.message}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              {new Date(alert.timestamp).toLocaleTimeString('en-US')}
                            </p>
                          </div>
                          {!alert.read && (
                            <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5"></div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {alerts.length > 0 && (
                  <div className="p-2 border-t border-gray-200">
                    <button
                      onClick={() => {
                        setIsAlertOpen(false);
                        navigate('/logs');
                      }}
                      className="w-full py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      View all logs
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <button className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
            <i className="ri-question-line text-xl text-gray-600"></i>
          </button>

          <div className="w-px h-6 bg-purple-100"></div>

          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                {user?.email?.[0].toUpperCase() || 'A'}
              </div>
              <i className={`ri-arrow-down-s-line text-gray-600 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`}></i>
            </button>

            {isProfileOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50 animate-fadeIn">
                <div className="px-4 py-3 border-b border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                      {user?.email?.[0].toUpperCase() || 'A'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {user?.email?.split('@')[0] || 'Admin User'}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {user?.email || 'admin@faas.io'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="py-2">
                  <button
                    onClick={() => {
                      setIsProfileOpen(false);
                      navigate('/settings');
                    }}
                    className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors cursor-pointer text-left"
                  >
                    <i className="ri-user-line text-lg text-gray-600"></i>
                    <span className="text-sm text-gray-700">My Profile</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsProfileOpen(false);
                      navigate('/settings');
                    }}
                    className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors cursor-pointer text-left"
                  >
                    <i className="ri-settings-3-line text-lg text-gray-600"></i>
                    <span className="text-sm text-gray-700">Settings</span>
                  </button>
                </div>

                <div className="border-t border-gray-200 pt-2">
                  <button
                    onClick={handleLogout}
                    className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-red-50 transition-colors cursor-pointer text-left"
                  >
                    <i className="ri-logout-box-line text-lg text-red-600"></i>
                    <span className="text-sm text-red-600 font-medium">Logout</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}