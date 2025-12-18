import { useState, useMemo, useEffect } from 'react';
import Sidebar from '../dashboard/components/Sidebar';
import Header from '../dashboard/components/Header';
import { useNavigate } from 'react-router-dom';
import { logApi } from '../../services/logApi';
import { functionApi } from '../../services/functionApi';

interface LogEntry {
  id: string;
  timestamp: string;
  functionName: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  duration: number;
  requestId: string;
}

export default function LogsPage() {
  const navigate = useNavigate();
  const [selectedFunction, setSelectedFunction] = useState('all');
  const [selectedLevel, setSelectedLevel] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [functionsList, setFunctionsList] = useState<{ id: string; name: string }[]>([]);
  const logsPerPage = 20;

  const fetchLogs = async () => {
    try {
      setIsRefreshing(true);
      const response = await logApi.getLogs();
      const logsData = Array.isArray(response) ? response : (response as any).logs || [];
      // Map API response to Component LogEntry if needed, or cast
      setLogs(logsData.map((l: any) => ({
        id: l.id,
        timestamp: l.timestamp,
        functionName: l.functionName || 'unknown',
        level: l.level === 'warn' ? 'warning' : l.level,
        message: l.message,
        duration: l.duration || 0,
        requestId: l.requestId || '-'
      })));
    } catch (error) {
      console.error('Failed to fetch logs:', error);
      // Fallback Mock Data
      const mockLogs: LogEntry[] = Array.from({ length: 20 }, (_, i) => ({
        id: `log-mock-${i}`,
        timestamp: new Date().toISOString(),
        functionName: ['image-processor', 'data-analyzer'][i % 2],
        level: i % 5 === 0 ? 'error' : 'info',
        message: i % 5 === 0 ? 'Connection timeout' : 'Function executed successfully',
        duration: 100 + i * 10,
        requestId: `req-${i}`
      }));
      setLogs(mockLogs);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLogs();

    // Fetch function list for filter
    functionApi.getFunctions().then(funcs => {
      setFunctionsList(funcs.map((f: any) => ({
        id: f.functionId,
        name: f.name || f.functionId
      })));
    }).catch(console.error);
  }, []);

  const handleRefresh = async () => {
    await fetchLogs();
  };

  const handleApplyFilters = () => {
    // 필터 적용 시 첫 페이지로 이동
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setSelectedFunction('all');
    setSelectedLevel('all');
    setCurrentPage(1);
  };

  // 필터링된 로그
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const functionMatch = selectedFunction === 'all' || log.functionName === selectedFunction;
      const levelMatch = selectedLevel === 'all' || log.level === selectedLevel;
      return functionMatch && levelMatch;
    });
  }, [logs, selectedFunction, selectedLevel]);

  // 페이지네이션 계산
  const totalPages = Math.ceil(filteredLogs.length / logsPerPage);
  const startIndex = (currentPage - 1) * logsPerPage;
  const endIndex = startIndex + logsPerPage;
  const currentLogs = filteredLogs.slice(startIndex, endIndex);

  // 페이지 변경 핸들러
  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  // 필터 변경 시 첫 페이지로 리셋
  const handleFunctionChange = (value: string) => {
    setSelectedFunction(value);
    setCurrentPage(1);
  };

  const handleLevelChange = (value: string) => {
    setSelectedLevel(value);
    setCurrentPage(1);
  };

  const getLevelColor = (level: string) => {
    const colors: Record<string, string> = {
      'info': 'bg-blue-50 text-blue-600 border-blue-200',
      'warn': 'bg-yellow-50 text-yellow-600 border-yellow-200',
      'error': 'bg-red-50 text-red-600 border-red-200'
    };
    return colors[level] || 'bg-gray-50 text-gray-600';
  };

  const getLevelIcon = (level: string) => {
    const icons: Record<string, string> = {
      'info': 'ri-information-line',
      'warn': 'ri-alert-line',
      'error': 'ri-error-warning-line'
    };
    return icons[level] || 'ri-information-line';
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-gray-100">
      <Sidebar onSystemStatusClick={() => { }} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-6 py-8">
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">실행 로그</h1>
              <p className="text-gray-600">모든 함수의 실행 로그를 실시간으로 확인하세요</p>
            </div>

            {/* Filters */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200 p-6 shadow-sm mb-6">
              <div className="grid md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">함수 선택</label>
                  <select
                    value={selectedFunction}
                    onChange={(e) => handleFunctionChange(e.target.value)}
                    className="w-full px-4 py-2 bg-white border border-blue-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                  >
                    <option value="all">전체 함수</option>
                    {functionsList.map(func => (
                      <option key={func.id} value={func.name}>{func.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">로그 레벨</label>
                  <select
                    value={selectedLevel}
                    onChange={(e) => handleLevelChange(e.target.value)}
                    className="w-full px-4 py-2 bg-white border border-blue-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                  >
                    <option value="all">전체</option>
                    <option value="info">Info</option>
                    <option value="warn">Warning</option>
                    <option value="error">Error</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">시작 시간</label>
                  <input
                    type="datetime-local"
                    className="w-full px-4 py-2 bg-white border border-blue-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">종료 시간</label>
                  <input
                    type="datetime-local"
                    className="w-full px-4 py-2 bg-white border border-blue-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={handleApplyFilters}
                  className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all whitespace-nowrap cursor-pointer text-sm"
                >
                  필터 적용
                </button>
                <button
                  onClick={handleResetFilters}
                  className="px-4 py-2 bg-white border border-blue-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all whitespace-nowrap cursor-pointer text-sm"
                >
                  초기화
                </button>
                <div className="flex-1"></div>
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-blue-200 hover:bg-gray-50 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <i className={`ri-refresh-line text-gray-600 ${isRefreshing ? 'animate-spin' : ''}`}></i>
                </button>
              </div>
            </div>

            {/* Logs List */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">로그 목록</h2>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">자동 새로고침</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-purple-400 peer-checked:to-pink-400"></div>
                  </label>
                </div>
              </div>

              <div className="divide-y divide-purple-100">
                {currentLogs.map((log) => (
                  <div key={log.id} className="px-6 py-4 hover:bg-gray-50/30 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 mt-1">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${getLevelColor(log.level)}`}>
                          <i className={`${getLevelIcon(log.level)} text-sm`}></i>
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-sm font-mono text-gray-500">{log.timestamp}</span>
                          <span className="text-sm font-semibold text-gray-900">{log.functionName}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getLevelColor(log.level)}`}>
                            {log.level.toUpperCase()}
                          </span>
                          <span className="text-xs text-gray-500">{log.duration}ms</span>
                        </div>
                        <p className="text-sm text-gray-700 mb-2">{log.message}</p>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>Request ID: {log.requestId}</span>
                          <button className="text-blue-600 hover:text-blue-700 font-medium cursor-pointer">
                            자세히 보기
                          </button>
                        </div>
                      </div>

                      <button className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-50 transition-colors cursor-pointer">
                        <i className="ri-more-2-fill text-gray-600"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <span className="text-sm text-gray-600">총 {filteredLogs.length}개의 로그</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePreviousPage}
                    disabled={currentPage === 1}
                    className={`px-3 py-1.5 bg-white border border-blue-200 text-gray-700 rounded-xl transition-all text-sm font-medium whitespace-nowrap cursor-pointer ${currentPage === 1
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-gray-50'
                      }`}
                  >
                    이전
                  </button>
                  <span className="text-sm text-gray-600">{currentPage} / {totalPages}</span>
                  <button
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages}
                    className={`px-3 py-1.5 bg-white border border-blue-200 text-gray-700 rounded-xl transition-all text-sm font-medium whitespace-nowrap cursor-pointer ${currentPage === totalPages
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-gray-50'
                      }`}
                  >
                    다음
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
}
