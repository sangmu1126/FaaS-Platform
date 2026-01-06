import { useState } from 'react';
import Sidebar from '../dashboard/components/Sidebar';
import Header from '../dashboard/components/Header';

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('account');

  const sections = [
    { id: 'account', label: '계정 설정', icon: 'ri-user-line' },
    { id: 'api', label: 'API 키', icon: 'ri-key-line' },
    { id: 'billing', label: '결제 및 요금', icon: 'ri-bank-card-line' },
    { id: 'notifications', label: '알림 설정', icon: 'ri-notification-line' }
  ];

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-gray-100">
      <Sidebar systemStatus={null} onSystemStatusClick={() => { }} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-6 py-8">
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">설정</h1>
              <p className="text-gray-600">계정 및 서비스 설정을 관리하세요</p>
            </div>

            <div className="grid md:grid-cols-4 gap-6">
              {/* Settings Menu */}
              <div className="md:col-span-1">
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200 p-2 shadow-sm">
                  {sections.map((section) => (
                    <button
                      key={section.id}
                      onClick={() => setActiveSection(section.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer text-left ${activeSection === section.id
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md'
                        : 'text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                      <i className={`${section.icon} text-xl`}></i>
                      <span className="font-medium text-sm">{section.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Settings Content */}
              <div className="md:col-span-3">
                {/* Account Settings */}
                {activeSection === 'account' && (
                  <div className="space-y-6">
                    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200 p-6 shadow-sm">
                      <h2 className="text-xl font-bold text-gray-900 mb-6">프로필 정보</h2>

                      <div className="flex items-center gap-6 mb-6">
                        <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-3xl shadow-md">
                          A
                        </div>
                        <div>
                          <button className="px-4 py-2 bg-white border border-purple-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all whitespace-nowrap cursor-pointer text-sm mr-2">
                            사진 변경
                          </button>
                          <button className="px-4 py-2 text-red-600 font-semibold rounded-xl hover:bg-red-50 transition-all whitespace-nowrap cursor-pointer text-sm">
                            삭제
                          </button>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">이름</label>
                          <input
                            type="text"
                            defaultValue="admin"
                            className="w-full px-4 py-3 bg-white border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">이메일</label>
                          <input
                            type="email"
                            defaultValue="admin@test.com"
                            className="w-full px-4 py-3 bg-white border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">회사</label>
                          <input
                            type="text"
                            defaultValue="Softbank"
                            className="w-full px-4 py-3 bg-white border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-3 mt-6">
                        <button className="px-6 py-2.5 bg-white border border-purple-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all whitespace-nowrap cursor-pointer">
                          취소
                        </button>
                        <button className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all whitespace-nowrap cursor-pointer">
                          저장
                        </button>
                      </div>
                    </div>

                    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200 p-6 shadow-sm">
                      <h2 className="text-xl font-bold text-gray-900 mb-6">비밀번호 변경</h2>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">현재 비밀번호</label>
                          <input
                            type="password"
                            className="w-full px-4 py-3 bg-white border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 transition-all"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">새 비밀번호</label>
                          <input
                            type="password"
                            className="w-full px-4 py-3 bg-white border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 transition-all"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">비밀번호 확인</label>
                          <input
                            type="password"
                            className="w-full px-4 py-3 bg-white border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 transition-all"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end mt-6">
                        <button className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all whitespace-nowrap cursor-pointer">
                          비밀번호 변경
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* API Keys */}
                {activeSection === 'api' && (
                  <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-xl font-bold text-gray-900">API 키 관리</h2>
                      <button className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all whitespace-nowrap cursor-pointer text-sm flex items-center gap-2">
                        <i className="ri-add-line"></i>
                        새 키 생성
                      </button>
                    </div>

                    <div className="space-y-4">
                      {[
                        { name: 'Production Key', key: 'ng_prod_abc123...', created: '2025-01-10', lastUsed: '2시간 전' },
                        { name: 'Development Key', key: 'ng_dev_def456...', created: '2025-01-05', lastUsed: '1일 전' }
                      ].map((apiKey, index) => (
                        <div key={index} className="bg-gradient-to-br from-purple-50 to-pink-50 border border-gray-200 rounded-xl p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h3 className="font-semibold text-gray-900 mb-1">{apiKey.name}</h3>
                              <div className="flex items-center gap-2">
                                <code className="text-sm text-gray-600 font-mono">{apiKey.key}</code>
                                <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-white transition-colors cursor-pointer">
                                  <i className="ri-file-copy-line text-gray-600 text-sm"></i>
                                </button>
                              </div>
                            </div>
                            <button className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-red-50 transition-colors cursor-pointer">
                              <i className="ri-delete-bin-line text-red-600"></i>
                            </button>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span>생성일: {apiKey.created}</span>
                            <span>마지막 사용: {apiKey.lastUsed}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Billing */}
                {activeSection === 'billing' && (
                  <div className="space-y-6">
                    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200 p-6 shadow-sm">
                      <h2 className="text-xl font-bold text-gray-900 mb-6">현재 요금제</h2>

                      <div className="bg-gradient-to-r from-blue-400 via-purple-400 to-indigo-400 rounded-2xl p-6 text-white mb-6 shadow-lg">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="text-2xl font-bold mb-1">Pro Plan</h3>
                            <p className="text-white/90">월 $49 / 무제한 함수</p>
                          </div>
                          <button className="px-4 py-2 bg-white text-blue-600 font-semibold rounded-xl hover:shadow-lg transition-all whitespace-nowrap cursor-pointer text-sm">
                            플랜 변경
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/20">
                          <div>
                            <div className="text-white/80 text-sm mb-1">이번 달 사용량</div>
                            <div className="text-2xl font-bold">$24</div>
                          </div>
                          <div>
                            <div className="text-white/80 text-sm mb-1">총 실행 횟수</div>
                            <div className="text-2xl font-bold">7.8K</div>
                          </div>
                          <div>
                            <div className="text-white/80 text-sm mb-1">다음 결제일</div>
                            <div className="text-2xl font-bold">2월 1일</div>
                          </div>
                        </div>
                      </div>

                      <h3 className="font-bold text-gray-900 mb-4">결제 수단</h3>
                      <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-gray-200 rounded-xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                            <i className="ri-bank-card-line text-2xl text-blue-600"></i>
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900">•••• •••• •••• 4242</div>
                            <div className="text-sm text-gray-600">만료일: 12/25</div>
                          </div>
                        </div>
                        <button className="px-4 py-2 bg-white border border-purple-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all whitespace-nowrap cursor-pointer text-sm">
                          변경
                        </button>
                      </div>
                    </div>

                    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200 p-6 shadow-sm">
                      <h2 className="text-xl font-bold text-gray-900 mb-6">결제 내역</h2>
                      <div className="space-y-3">
                        {[
                          { date: '2025-01-01', amount: '$49.00', status: '완료' },
                          { date: '2024-12-01', amount: '$49.00', status: '완료' },
                          { date: '2024-11-01', amount: '$49.00', status: '완료' }
                        ].map((payment, index) => (
                          <div key={index} className="flex items-center justify-between py-3 border-b border-gray-200 last:border-0">
                            <div>
                              <div className="font-semibold text-gray-900">{payment.date}</div>
                              <div className="text-sm text-gray-600">Pro Plan 월 구독</div>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="font-semibold text-gray-900">{payment.amount}</span>
                              <span className="text-sm text-green-600">{payment.status}</span>
                              <button className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-50 transition-colors cursor-pointer">
                                <i className="ri-download-line text-gray-600"></i>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Notifications */}
                {activeSection === 'notifications' && (
                  <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200 p-6 shadow-sm">
                    <h2 className="text-xl font-bold text-gray-900 mb-6">알림 설정</h2>

                    <div className="space-y-6">
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-4">이메일 알림</h3>
                        <div className="space-y-3">
                          {[
                            { label: '함수 배포 완료', checked: true },
                            { label: '함수 실행 오류', checked: true },
                            { label: '비용 임계값 도달', checked: true },
                            { label: '주간 리포트', checked: false }
                          ].map((item, index) => (
                            <label key={index} className="flex items-center justify-between py-3 cursor-pointer hover:bg-gray-50/30 rounded-xl px-3 transition-colors">
                              <span className="text-gray-700">{item.label}</span>
                              <input
                                type="checkbox"
                                defaultChecked={item.checked}
                                className="w-5 h-5 text-purple-500 rounded focus:ring-2 focus:ring-purple-400 cursor-pointer"
                              />
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="border-t border-gray-200 pt-6">
                        <h3 className="font-semibold text-gray-900 mb-4">푸시 알림</h3>
                        <div className="space-y-3">
                          {[
                            { label: '함수 실행 오류', checked: true },
                            { label: '비용 임계값 도달', checked: true }
                          ].map((item, index) => (
                            <label key={index} className="flex items-center justify-between py-3 cursor-pointer hover:bg-gray-50/30 rounded-xl px-3 transition-colors">
                              <span className="text-gray-700">{item.label}</span>
                              <input
                                type="checkbox"
                                defaultChecked={item.checked}
                                className="w-5 h-5 text-purple-500 rounded focus:ring-2 focus:ring-purple-400 cursor-pointer"
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end mt-6">
                      <button className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all whitespace-nowrap cursor-pointer">
                        저장
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
