import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  const handleGetStarted = () => {
    navigate('/dashboard');
  };

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50">
      {/* Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/80 backdrop-blur-lg shadow-sm' : 'bg-transparent'
        }`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center bg-gradient-to-br from-purple-400 to-pink-400 rounded-xl">
              <i className="ri-flashlight-fill text-white text-lg"></i>
            </div>
            <span className={`text-xl font-bold transition-colors ${scrolled ? 'text-gray-900' : 'text-gray-900'
              }`} style={{ fontFamily: 'Space Grotesk, sans-serif' }}>FaaS Platform</span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className={`text-sm font-medium transition-colors hover:text-purple-500 ${scrolled ? 'text-gray-700' : 'text-gray-700'
              }`}>Features</a>
            <a href="#performance" className={`text-sm font-medium transition-colors hover:text-purple-500 ${scrolled ? 'text-gray-700' : 'text-gray-700'
              }`}>Performance</a>
            <a href="#demo" className={`text-sm font-medium transition-colors hover:text-purple-500 ${scrolled ? 'text-gray-700' : 'text-gray-700'
              }`}>Demo</a>
            <a href="#reviews" className={`text-sm font-medium transition-colors hover:text-purple-500 ${scrolled ? 'text-gray-700' : 'text-gray-700'
              }`}>Reviews</a>
          </div>

          <button
            onClick={handleGetStarted}
            className="px-6 py-2.5 bg-gradient-to-r from-purple-400 to-pink-400 text-white text-sm font-semibold rounded-full hover:shadow-lg transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer"
          >
            Go to Dashboard
            <i className="ri-arrow-right-line"></i>
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center overflow-hidden pt-20">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 left-10 w-72 h-72 bg-purple-300/30 rounded-full blur-3xl"></div>
          <div className="absolute top-40 right-20 w-96 h-96 bg-pink-300/30 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 left-1/3 w-80 h-80 bg-blue-300/30 rounded-full blur-3xl"></div>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-6 py-32 w-full">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-block px-4 py-1.5 bg-white/60 backdrop-blur-sm rounded-full mb-6 border border-purple-200">
                <span className="text-purple-600 text-xs font-medium">Production-Grade Serverless</span>
              </div>

              <h1 className="text-5xl md:text-7xl font-bold mb-6" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                <div className="text-gray-900 mb-2">Zero Cold Start</div>
                <div className="bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent mb-2">Polyglot FaaS</div>
                <div className="text-gray-900">Built on EC2</div>
              </h1>

              <p className="text-gray-600 text-lg leading-relaxed mb-8 max-w-xl">
                A custom FaaS engine that goes beyond AWS Lambda's structural limitations. Docker-based multi-tenant isolation for instant execution of any language.
              </p>

              <div className="flex flex-wrap gap-4">
                <button className="px-8 py-3.5 bg-gradient-to-r from-purple-400 to-pink-400 text-white font-semibold rounded-full hover:shadow-lg transition-all whitespace-nowrap cursor-pointer">
                  Get Started
                </button>
                <button className="px-8 py-3.5 bg-white/60 backdrop-blur-sm text-gray-700 font-semibold rounded-full hover:bg-white/80 transition-all whitespace-nowrap cursor-pointer border border-gray-200">
                  View Documentation
                </button>
              </div>
            </div>

            <div className="relative">
              <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-6 border border-purple-200/50 shadow-xl">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                  <div className="w-3 h-3 rounded-full bg-green-400"></div>
                  <span className="ml-auto text-gray-500 text-xs">terminal</span>
                </div>
                <div className="font-mono text-sm space-y-2">
                  <div className="text-purple-600">$ faas deploy function.py</div>
                  <div className="text-gray-500">→ Deploying to FaaS Platform...</div>
                  <div className="text-green-500">✓ Function deployed in 0.3s</div>
                  <div className="text-gray-500">→ Cold start: <span className="text-purple-600 font-bold">0ms</span></div>
                  <div className="text-gray-500">→ Execution time: <span className="text-purple-600 font-bold">12ms</span></div>
                  <div className="text-green-500">✓ Ready to serve requests</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cold Start Comparison */}
      <section className="grid md:grid-cols-2 min-h-screen">
        <div className="relative bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center p-12">
          <div className="relative z-10">
            <div className="inline-block px-4 py-1.5 bg-red-100 border border-red-300 rounded-full mb-8">
              <span className="text-red-600 text-sm font-medium">Traditional FaaS</span>
            </div>

            <h2 className="text-4xl md:text-6xl font-bold text-gray-800 leading-tight" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              <div className="mb-3">Firecracker VM</div>
              <div className="mb-3 text-5xl md:text-7xl">Runtime Load</div>
              <div className="text-6xl md:text-8xl text-red-500">= Cold Start</div>
            </h2>
          </div>
        </div>

        <div className="bg-white flex items-center justify-center p-12">
          <div className="max-w-lg text-center">
            <h2 className="text-4xl md:text-6xl font-bold text-gray-900 mb-8 leading-tight" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              FaaS Approach
            </h2>

            <p className="text-gray-600 text-lg leading-relaxed mb-10">
              Eliminates VM boot process with Warm Pool + Docker Pause/Unpause strategy. Ultra-fast execution environment built without Firecracker.
            </p>

            <button className="px-8 py-3.5 bg-gradient-to-r from-purple-400 to-pink-400 text-white font-semibold rounded-full hover:shadow-lg transition-all whitespace-nowrap cursor-pointer inline-flex items-center gap-2">
              View Benchmarks
              <i className="ri-arrow-right-line"></i>
            </button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-16">
            <h2 className="text-5xl md:text-6xl font-bold text-gray-900 mb-4 md:mb-0" style={{ fontFamily: 'Playfair Display, serif' }}>
              <div>Why FaaS Platform</div>
              <div>Outperforms</div>
            </h2>
            <p className="text-gray-500 text-lg max-w-md">
              A next-generation FaaS platform that solves structural problems from the ground up
            </p>
          </div>

          <div className="grid md:grid-cols-12 gap-6">
            <div className="md:col-span-5 bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-8 border border-purple-100 hover:shadow-lg transition-shadow">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-200 to-pink-200 rounded-2xl flex items-center justify-center mb-6">
                <i className="ri-speed-up-line text-3xl text-purple-600"></i>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Instant Optimization</h3>
              <p className="text-gray-600 leading-relaxed">
                Calculate optimal specs from a single execution. Faster cost savings than AWS Compute Optimizer. Instant recommendations without days of logs.
              </p>
            </div>

            <div className="md:col-span-3 bg-gradient-to-br from-purple-400 to-pink-400 rounded-2xl p-8 text-white hover:shadow-lg transition-shadow">
              <h3 className="text-2xl font-bold mb-8 text-center">Polyglot Support</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 flex flex-col items-center justify-center">
                  <i className="ri-code-s-slash-line text-3xl mb-2"></i>
                  <span className="text-sm font-medium">Python</span>
                </div>
                <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 flex flex-col items-center justify-center">
                  <i className="ri-javascript-line text-3xl mb-2"></i>
                  <span className="text-sm font-medium">Node.js</span>
                </div>
                <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 flex flex-col items-center justify-center">
                  <i className="ri-terminal-box-line text-3xl mb-2"></i>
                  <span className="text-sm font-medium">C++</span>
                </div>
                <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 flex flex-col items-center justify-center">
                  <i className="ri-braces-line text-3xl mb-2"></i>
                  <span className="text-sm font-medium">Go</span>
                </div>
              </div>
            </div>

            <div className="md:col-span-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-8 border border-blue-100 hover:shadow-lg transition-shadow">
              <h3 className="text-2xl font-bold mb-6 text-center text-gray-900">Production-Grade</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3 bg-white/60 rounded-lg p-3">
                  <i className="ri-cloud-line text-xl text-purple-500"></i>
                  <span className="text-sm font-medium text-gray-700">Spot Fleet Auto Scaling</span>
                </div>
                <div className="flex items-center gap-3 bg-white/60 rounded-lg p-3">
                  <i className="ri-database-2-line text-xl text-purple-500"></i>
                  <span className="text-sm font-medium text-gray-700">Redis Queue Management</span>
                </div>
                <div className="flex items-center gap-3 bg-white/60 rounded-lg p-3">
                  <i className="ri-container-line text-xl text-purple-500"></i>
                  <span className="text-sm font-medium text-gray-700">Docker Multi-Tenant</span>
                </div>
                <div className="flex items-center gap-3 bg-white/60 rounded-lg p-3">
                  <i className="ri-git-branch-line text-xl text-purple-500"></i>
                  <span className="text-sm font-medium text-gray-700">Control/Data Plane Split</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Language Demo Section */}
      <section id="demo" className="py-24 bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mb-16">
            <h2 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              <div>Any Language</div>
              <div>Same Architecture</div>
            </h2>
            <p className="text-gray-600 text-lg leading-relaxed">
              Python Fibonacci 45 → 1-2 seconds. Switch to C++ → instant completion. Only the language changed, execution method is the same.
            </p>
          </div>

          <div className="grid md:grid-cols-5 gap-6">
            <div className="md:col-span-2 bg-white/80 backdrop-blur-sm rounded-2xl overflow-hidden shadow-lg border border-blue-100">
              <div className="bg-gradient-to-r from-blue-400 to-blue-500 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <i className="ri-python-line text-2xl text-white"></i>
                  <span className="text-white font-semibold">Python</span>
                </div>
                <span className="text-blue-100 text-sm">~1.8s</span>
              </div>
              <div className="p-6 font-mono text-sm">
                <div className="text-gray-500"># fibonacci.py</div>
                <div className="text-purple-600 mt-2">def</div>
                <div className="text-gray-800"> fibonacci(n):</div>
                <div className="text-gray-600 ml-4">if n &lt;= 1:</div>
                <div className="text-gray-600 ml-8">return n</div>
                <div className="text-gray-600 ml-4">return fibonacci(n-1)</div>
                <div className="text-gray-600 ml-8">+ fibonacci(n-2)</div>
                <div className="text-gray-800 mt-4">result = fibonacci(45)</div>
              </div>
            </div>

            <div className="md:col-span-3 bg-white/80 backdrop-blur-sm rounded-2xl overflow-hidden shadow-lg border border-orange-100">
              <div className="bg-gradient-to-r from-orange-400 to-red-400 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <i className="ri-terminal-box-line text-2xl text-white"></i>
                  <span className="text-white font-semibold">C++</span>
                </div>
                <span className="text-orange-100 text-sm font-bold">~0.1s ⚡</span>
              </div>
              <div className="p-6 font-mono text-sm">
                <div className="text-gray-500">// fibonacci.cpp</div>
                <div className="text-purple-600 mt-2">#include &lt;iostream&gt;</div>
                <div className="text-purple-600">using namespace std;</div>
                <div className="text-gray-800 mt-3">int fibonacci(int n) {'{'}</div>
                <div className="text-gray-600 ml-4">if (n &lt;= 1) return n;</div>
                <div className="text-gray-600 ml-4">return fibonacci(n-1)</div>
                <div className="text-gray-600 ml-8">+ fibonacci(n-2);</div>
                <div className="text-gray-800">{'}'}</div>
                <div className="text-gray-800 mt-3">int main() {'{'}</div>
                <div className="text-gray-600 ml-4">cout &lt;&lt; fibonacci(45);</div>
                <div className="text-gray-800">{'}'}</div>
              </div>
            </div>
          </div>

          <div className="mt-12 bg-purple-50 border-l-4 border-purple-400 rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-400 rounded-lg flex items-center justify-center flex-shrink-0">
                <i className="ri-lightbulb-line text-white text-xl"></i>
              </div>
              <div>
                <h4 className="text-lg font-bold text-gray-900 mb-2">Architectural Flexibility</h4>
                <p className="text-gray-700">
                  Only the language changed, the execution method is the same. FaaS Platform is a Polyglot FaaS that can run any language instantly.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Performance Metrics */}
      <section id="performance" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-5xl md:text-6xl font-bold mb-6 text-gray-900" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Real Performance Metrics
            </h2>
            <p className="text-gray-500 text-lg">
              Production-verified performance
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-8 border border-purple-100 hover:shadow-lg transition-all">
              <div className="text-5xl font-bold text-purple-500 mb-3">0ms</div>
              <div className="text-gray-700 font-medium mb-2">Cold Start Time</div>
              <div className="text-gray-500 text-sm">Completely eliminated with Warm Pool strategy</div>
            </div>

            <div className="bg-gradient-to-br from-pink-50 to-rose-50 rounded-2xl p-8 border border-pink-100 hover:shadow-lg transition-all">
              <div className="text-5xl font-bold text-pink-500 mb-3">85%</div>
              <div className="text-gray-700 font-medium mb-2">Cost Savings</div>
              <div className="text-gray-500 text-sm">With Auto-Tuner optimization applied</div>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-8 border border-blue-100 hover:shadow-lg transition-all">
              <div className="text-5xl font-bold text-blue-500 mb-3">10+</div>
              <div className="text-gray-700 font-medium mb-2">Supported Languages</div>
              <div className="text-gray-500 text-sm">Python, Node, C++, Go, etc.</div>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-8 border border-green-100 hover:shadow-lg transition-all">
              <div className="text-5xl font-bold text-green-500 mb-3">99.9%</div>
              <div className="text-gray-700 font-medium mb-2">Availability</div>
              <div className="text-gray-500 text-sm">Spot Fleet + Auto Scaling</div>
            </div>
          </div>
        </div>
      </section>

      {/* Reviews Section */}
      <section id="reviews" className="py-24 bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-16">
            <div className="inline-block px-4 py-1.5 bg-white/60 backdrop-blur-sm border border-purple-200 rounded-full mb-6">
              <span className="text-purple-600 text-sm font-medium">Trusted by Developers</span>
            </div>
            <h2 className="text-5xl md:text-6xl font-bold text-gray-900" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              <div>Real Teams</div>
              <div>Real Results</div>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="space-y-6">
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-purple-100 hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white font-bold">
                    JK
                  </div>
                  <div>
                    <div className="font-bold text-gray-900">Junho Kim</div>
                    <div className="text-sm text-gray-500">Backend Lead, TechCorp</div>
                  </div>
                </div>
                <p className="text-gray-700 leading-relaxed">
                  "We adopted FaaS Platform while struggling with Lambda's Cold Start issue. Response times improved by over 10x, and costs were significantly reduced."
                </p>
              </div>

              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-purple-100 hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-indigo-400 to-purple-400 rounded-full flex items-center justify-center text-white font-bold">
                    SL
                  </div>
                  <div>
                    <div className="font-bold text-gray-900">Seoyeon Lee</div>
                    <div className="text-sm text-gray-500">CTO, StartupX</div>
                  </div>
                </div>
                <p className="text-gray-700 leading-relaxed">
                  "Multi-language support is really powerful. Being able to use Python and C++ simultaneously while maintaining a consistent architecture greatly improved development productivity."
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-pink-100 hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-pink-400 to-rose-400 rounded-full flex items-center justify-center text-white font-bold">
                    MJ
                  </div>
                  <div>
                    <div className="font-bold text-gray-900">Minjun Park</div>
                    <div className="text-sm text-gray-500">DevOps Engineer, CloudNet</div>
                  </div>
                </div>
                <p className="text-gray-700 leading-relaxed">
                  "The Auto-Tuner feature is really impressive. Being able to get optimal spec recommendations from a single execution and apply them immediately maximized operational efficiency."
                </p>
              </div>

              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-blue-100 hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-indigo-400 rounded-full flex items-center justify-center text-white font-bold">
                    HY
                  </div>
                  <div>
                    <div className="font-bold text-gray-900">Hyunwoo Choi</div>
                    <div className="text-sm text-gray-500">Software Architect, DataFlow</div>
                  </div>
                </div>
                <p className="text-gray-700 leading-relaxed">
                  "The Production-Grade architecture is really solid. Stable service operation became possible with Spot Fleet and Redis-based queue management."
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-green-100 hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-400 rounded-full flex items-center justify-center text-white font-bold">
                    YJ
                  </div>
                  <div>
                    <div className="font-bold text-gray-900">Yujin Jeong</div>
                    <div className="text-sm text-gray-500">Lead Developer, AILab</div>
                  </div>
                </div>
                <p className="text-gray-700 leading-relaxed">
                  "In the education market, it's really useful that students can run C/C++ code directly in the cloud. The accessibility is excellent."
                </p>
              </div>

              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-orange-100 hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-red-400 rounded-full flex items-center justify-center text-white font-bold">
                    DH
                  </div>
                  <div>
                    <div className="font-bold text-gray-900">Donghyun Kang</div>
                    <div className="text-sm text-gray-500">Platform Engineer, ScaleUp</div>
                  </div>
                </div>
                <p className="text-gray-700 leading-relaxed">
                  "The approach of implementing directly with Docker without Firecracker is creative. The Cold Start problem was completely resolved."
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-br from-purple-400 via-pink-400 to-rose-400 text-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-5xl md:text-6xl font-bold mb-6" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Get Started Now
          </h2>
          <p className="text-xl text-white/90 mb-10 leading-relaxed">
            Experience the next-generation FaaS platform that goes beyond AWS Lambda's structural limitations.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button className="px-10 py-4 bg-white text-purple-600 font-bold rounded-full hover:shadow-xl transition-all whitespace-nowrap cursor-pointer text-lg">
              Start for Free
            </button>
            <button className="px-10 py-4 bg-white/20 backdrop-blur-sm text-white font-bold rounded-full hover:bg-white/30 transition-all whitespace-nowrap cursor-pointer border-2 border-white text-lg">
              Request Demo
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gradient-to-br from-purple-50 to-pink-50 text-gray-700 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-5 gap-12 mb-12">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-10 h-10 flex items-center justify-center bg-gradient-to-br from-purple-400 to-pink-400 rounded-xl">
                  <i className="ri-flashlight-fill text-white text-xl"></i>
                </div>
                <span className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>FaaS Platform</span>
              </div>
              <p className="text-gray-600 mb-6 leading-relaxed" style={{ fontFamily: 'Playfair Display, serif' }}>
                Zero Cold Start, Polyglot FaaS Platform Built on EC2
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="email"
                  placeholder="Email address"
                  className="flex-1 px-4 py-2.5 bg-white border border-purple-200 rounded-lg text-sm focus:outline-none focus:border-purple-400 transition-colors"
                />
                <button className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-400 rounded-lg flex items-center justify-center hover:shadow-lg transition-all cursor-pointer">
                  <i className="ri-notification-line text-white"></i>
                </button>
              </div>
            </div>

            <div>
              <h4 className="font-bold mb-4 text-gray-900">Product</h4>
              <ul className="space-y-3">
                <li><a href="#features" className="text-gray-600 hover:text-purple-500 transition-colors text-sm cursor-pointer">Features</a></li>
                <li><a href="#performance" className="text-gray-600 hover:text-purple-500 transition-colors text-sm cursor-pointer">Performance</a></li>
                <li><a href="#" className="text-gray-600 hover:text-purple-500 transition-colors text-sm cursor-pointer">Pricing</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold mb-4 text-gray-900">Resources</h4>
              <ul className="space-y-3">
                <li><a href="#" className="text-gray-600 hover:text-purple-500 transition-colors text-sm cursor-pointer">Documentation</a></li>
                <li><a href="#" className="text-gray-600 hover:text-purple-500 transition-colors text-sm cursor-pointer">API Reference</a></li>
                <li><a href="#" className="text-gray-600 hover:text-purple-500 transition-colors text-sm cursor-pointer">Guides</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold mb-4 text-gray-900">Company</h4>
              <ul className="space-y-3">
                <li><a href="#" className="text-gray-600 hover:text-purple-500 transition-colors text-sm cursor-pointer">About</a></li>
                <li><a href="#" className="text-gray-600 hover:text-purple-500 transition-colors text-sm cursor-pointer">Blog</a></li>
                <li><a href="#" className="text-gray-600 hover:text-purple-500 transition-colors text-sm cursor-pointer">Contact</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-purple-200 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-gray-500 text-sm">
              © 2025 FaaS Platform. All rights reserved.
            </div>
            <div className="flex items-center gap-6">
              <a href="#" className="w-10 h-10 border border-purple-200 rounded-lg flex items-center justify-center hover:border-purple-400 hover:text-purple-500 transition-all cursor-pointer">
                <i className="ri-github-fill"></i>
              </a>
              <a href="#" className="w-10 h-10 border border-purple-200 rounded-lg flex items-center justify-center hover:border-purple-400 hover:text-purple-500 transition-all cursor-pointer">
                <i className="ri-twitter-x-line"></i>
              </a>
              <a href="#" className="w-10 h-10 border border-purple-200 rounded-lg flex items-center justify-center hover:border-purple-400 hover:text-purple-500 transition-all cursor-pointer">
                <i className="ri-linkedin-fill"></i>
              </a>
              <a href="#" className="w-10 h-10 border border-purple-200 rounded-lg flex items-center justify-center hover:border-purple-400 hover:text-purple-500 transition-all cursor-pointer">
                <i className="ri-discord-fill"></i>
              </a>
            </div>
            <div>
              <a href="https://readdy.ai/?origin=logo" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-purple-500 transition-colors text-sm cursor-pointer">
                Powered by Readdy
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
