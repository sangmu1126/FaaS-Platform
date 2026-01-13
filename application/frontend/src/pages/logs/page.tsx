import { useState, useMemo, useEffect } from 'react';
import Sidebar from '../dashboard/components/Sidebar';
import Header from '../dashboard/components/Header';
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
  functionId: string;
}

export default function LogsPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }

    setExpandedId(id);

    // Check if we need to fetch full log
    const logIndex = logs.findIndex(l => l.id === id);
    if (logIndex >= 0) {
      const log = logs[logIndex];
      if (log.message && (log.message.endsWith('...') || log.message.length === 200)) {
        try {
          // Fetch detail
          const fullMessage = await logApi.getLogDetail(log.functionId, log.requestId);

          // Update state
          const newLogs = [...logs];
          newLogs[logIndex] = { ...log, message: fullMessage };
          setLogs(newLogs);
        } catch (e) {
          console.error("Failed to load full log", e);
        }
      }
    }
  };

  const [selectedFunction, setSelectedFunction] = useState('all');

  const [selectedLevel, setSelectedLevel] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [functionsList, setFunctionsList] = useState<{ id: string; name: string }[]>([]);
  const logsPerPage = 20;

  // Function Name Map
  const functionNameMap = useMemo(() => {
    return functionsList.reduce((acc, func) => {
      acc[func.id] = func.name;
      return acc;
    }, {} as Record<string, string>);
  }, [functionsList]);


  const fetchLogs = async (funcId = selectedFunction, level = selectedLevel) => {
    try {
      setIsRefreshing(true);

      // Pass filters to API
      const response = await logApi.getLogs({
        functionId: funcId,
        level: level === 'all' ? undefined : (level as 'info' | 'warning' | 'error'),
        limit: logsPerPage
      });

      const rawLogs = response.logs;

      // Filter & Map Logs
      const processedLogs: LogEntry[] = rawLogs
        .filter((l: any) => {
          // Filter out irrelevant system logs
          const msg = l.msg || l.message;
          if (msg.includes('Redis Connected') || msg.includes('Subscribed') || msg.includes('Started') || msg.includes('Heartbeat')) return false;
          return true;
        })
        .map((l: any) => {
          // Normalize Level
          let normalizedLevel = (l.level || 'info').toLowerCase();
          if (normalizedLevel === 'warn') normalizedLevel = 'warning';

          const msg = l.msg || l.message;
          let status = 'INFO';

          if (msg.includes('Function Executed')) {
            status = normalizedLevel === 'error' ? 'ERROR' : 'SUCCESS';
          } else if (msg.includes('Run Request')) {
            status = 'PENDING';
          } else if (msg.includes('Upload Success')) {
            status = 'UPLOAD';
          } else if (msg.includes('Function Updated')) {
            status = 'UPDATE';
          } else if (msg.includes('Function Deleted')) {
            status = 'DELETE';
          } else if (msg.includes('Timeout')) {
            status = 'TIMEOUT';
          }

          // Normalize Duration/Memory
          const duration = l.duration || l.durationMs || 0;
          const memory = l.memory || l.memoryMb || 0;

          return {
            id: l.id,
            timestamp: l.timestamp,
            functionId: l.functionId,
            functionName: functionNameMap[l.functionId] || l.functionId || 'Unknown',
            level: normalizedLevel,
            message: msg,
            duration: duration,
            requestId: l.requestId || '-',
            // @ts-ignore - Adding status/memory to object for display
            status: status,
            memory: memory
          };
        });

      setLogs(processedLogs);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
      // Fallback Mock Data removed for production
      setLogs([]);
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
    fetchLogs(value, selectedLevel); // Immediate fetch
  };

  const handleLevelChange = (value: string) => {
    setSelectedLevel(value);
    setCurrentPage(1);
    fetchLogs(selectedFunction, value); // Immediate fetch
  };

  // ... (useEffect remains same) ...

  // Helper for Status Badge
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'SUCCESS': return { color: 'bg-green-50 text-green-700 border-green-200', label: '성공', icon: 'ri-check-line' };
      case 'ERROR': return { color: 'bg-red-50 text-red-700 border-red-200', label: '실패', icon: 'ri-close-line' };
      case 'PENDING': return { color: 'bg-yellow-50 text-yellow-700 border-yellow-200', label: '대기', icon: 'ri-loader-4-line animate-spin' };
      case 'UPLOAD': return { color: 'bg-blue-50 text-blue-700 border-blue-200', label: '업로드', icon: 'ri-upload-cloud-line' };
      case 'UPDATE': return { color: 'bg-purple-50 text-purple-700 border-purple-200', label: '업데이트', icon: 'ri-refresh-line' };
      case 'DELETE': return { color: 'bg-gray-50 text-gray-700 border-gray-200', label: '삭제', icon: 'ri-delete-bin-line' };
      case 'TIMEOUT': return { color: 'bg-orange-50 text-orange-700 border-orange-200', label: '시간초과', icon: 'ri-timer-line' };
      default: return { color: 'bg-gray-50 text-gray-600 border-gray-200', label: '시스템', icon: 'ri-information-line' };
    }
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-gray-100">
      <Sidebar systemStatus={null} onSystemStatusClick={() => { }} />

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
                    <option value="warning">Warning</option>
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
                {currentLogs.map((log) => {
                  // @ts-ignore
                  const statusConfig = getStatusConfig(log.status || 'INFO');

                  const isExpanded = expandedId === log.id;

                  return (
                    <div key={log.id} className={`transition-all border-l-4 ${isExpanded ? 'bg-blue-50/50 border-l-blue-500 shadow-sm my-2 rounded-xl' : 'hover:bg-gray-50/50 border-l-transparent hover:border-l-blue-500'}`}>
                      <div className="px-6 py-4 cursor-pointer" onClick={() => toggleExpand(log.id)}>
                        <div className="flex items-center gap-4">
                          {/* Status Icon Box */}
                          <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border ${statusConfig.color} bg-opacity-50`}>
                            <i className={`${statusConfig.icon} text-lg`}></i>
                          </div>

                          {/* Main Content */}
                          <div className="flex-1 min-w-0 grid grid-cols-12 gap-4 items-center">
                            {/* Col 1: Function & Time */}
                            <div className="col-span-4">
                              <h3 className="text-sm font-bold text-gray-900 truncate mb-1">
                                {log.functionName}
                              </h3>
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <i className="ri-time-line"></i>
                                <span>{new Date(log.timestamp).toLocaleString()}</span>
                              </div>
                            </div>

                            {/* Col 2: Status Badge */}
                            <div className="col-span-2">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${statusConfig.color}`}>
                                {statusConfig.icon.includes('spin') && <i className="ri-loader-4-line animate-spin"></i>}
                                {statusConfig.label}
                              </span>
                            </div>

                            {/* Col 3: Metrics */}
                            <div className="col-span-4 flex items-center gap-6">
                              <div className="flex flex-col">
                                <span className="text-xs text-gray-500 mb-0.5">응답 시간</span>
                                <span className="text-sm font-mono font-medium text-gray-700">
                                  {log.duration ? `${log.duration}ms` : '-'}
                                </span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-xs text-gray-500 mb-0.5">메모리</span>
                                <span className="text-sm font-mono font-medium text-gray-700">
                                  {/* @ts-ignore */}
                                  {log.memory ? `${log.memory} MB` : '-'}
                                </span>
                              </div>
                            </div>

                            {/* Col 4: Action */}
                            <div className="col-span-2 flex justify-end">
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleExpand(log.id); }}
                                className={`text-gray-400 hover:text-blue-600 transition-all p-2 rounded-full hover:bg-blue-50 ${isExpanded ? 'rotate-90 text-blue-600 bg-blue-50' : ''}`}
                              >
                                <i className="ri-arrow-right-s-line text-xl"></i>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="px-6 pb-4 pt-0 animate-in slide-in-from-top-2 duration-200">
                          <div className="ml-14 bg-gray-900 rounded-xl p-4 overflow-hidden border border-gray-800 shadow-inner">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Log Output</span>
                              <div className="flex gap-2">
                                <span className="text-xs text-gray-500">ID: {log.requestId}</span>
                              </div>
                            </div>
                            <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap break-all max-h-96 overflow-y-auto custom-scrollbar">
                              {log.message || "No output captured."}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
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
