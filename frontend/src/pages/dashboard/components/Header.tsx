import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../store/authStore';

export default function Header() {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { logout, user } = useAuthStore();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="bg-white/60 backdrop-blur-md border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="relative max-w-md">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg"></i>
            <input
              type="text"
              placeholder="함수 검색..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-300 transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-50 transition-colors cursor-pointer relative">
            <i className="ri-notification-line text-xl text-gray-600"></i>
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-400 rounded-full"></span>
          </button>

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
                    <span className="text-sm text-gray-700">내 프로필</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsProfileOpen(false);
                      navigate('/settings');
                    }}
                    className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors cursor-pointer text-left"
                  >
                    <i className="ri-settings-3-line text-lg text-gray-600"></i>
                    <span className="text-sm text-gray-700">설정</span>
                  </button>
                </div>

                <div className="border-t border-gray-200 pt-2">
                  <button
                    onClick={handleLogout}
                    className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-red-50 transition-colors cursor-pointer text-left"
                  >
                    <i className="ri-logout-box-line text-lg text-red-600"></i>
                    <span className="text-sm text-red-600 font-medium">로그아웃</span>
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