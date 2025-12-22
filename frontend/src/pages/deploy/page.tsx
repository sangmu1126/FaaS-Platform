import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../dashboard/components/Sidebar';
import Header from '../dashboard/components/Header';
import { functionApi } from '../../services/functionApi'; // Import API
import JSZip from 'jszip';

export default function DeployPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [showDeploymentModal, setShowDeploymentModal] = useState(false);
  const [deploymentStep, setDeploymentStep] = useState(0);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showFailureModal, setShowFailureModal] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [showBuildErrorModal, setShowBuildErrorModal] = useState(false);
  const [showGithubModal, setShowGithubModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [activeTestTab, setActiveTestTab] = useState<'input' | 'result' | 'analysis'>('input');
  const [testInput, setTestInput] = useState('{\n  "message": "Hello FaaS"\n}');
  const [githubUrl, setGithubUrl] = useState('');
  const [githubBranch, setGithubBranch] = useState('main');
  const [githubFilePath, setGithubFilePath] = useState('');
  const [failureInfo, setFailureInfo] = useState({ step: 0, message: '', detail: '' });
  const [buildError, setBuildError] = useState({ line: 0, message: '', code: '' });
  const [formData, setFormData] = useState({
    name: '',
    handler: 'handler.main',
    language: 'python',
    runtime: 'python3.11',
    memory: 512,
    timeout: 60, // Default 60s (Backend max: 300s)
    code: '',
    warmPoolEnabled: true,
    warmPoolSize: 2,
    envVars: [] as Array<{ key: string; value: string }>
  });
  const [deployedFunctionId, setDeployedFunctionId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const languages = [
    { id: 'python', name: 'Python', icon: 'ri-python-line', runtime: 'python3.11', version: '3.11' },
    { id: 'nodejs', name: 'Node.js', icon: 'ri-nodejs-line', runtime: 'nodejs20.x', version: '20.x' },
    { id: 'cpp', name: 'C++', icon: 'ri-terminal-box-line', runtime: 'cpp17', version: 'C++17' },
    { id: 'go', name: 'Go', icon: 'ri-code-s-slash-line', runtime: 'go1.21', version: '1.21' }
  ];

  const memoryOptions = [128, 256, 512, 1024, 2048, 4096];

  const codeTemplates: Record<string, string> = {
    python: `def handler(event, context):
    """
    FaaS Function Handler
    
    Args:
        event: 입력 이벤트 데이터
        context: 실행 컨텍스트
    
    Returns:
        응답 데이터
    """
    return {
        'statusCode': 200,
        'body': 'Hello from FaaS!'
    }

if __name__ == "__main__":
    import json
    import os
    
    # Simulate execution
    event = {}
    if os.environ.get("PAYLOAD"):
        try:
            event = json.loads(os.environ.get("PAYLOAD"))
        except:
            pass
            
    print(json.dumps(handler(event, {})))`,
    nodejs: `exports.handler = async (event, context) => {
    /**
     * FaaS Function Handler
     * 
     * @param {Object} event - 입력 이벤트 데이터
     * @param {Object} context - 실행 컨텍스트
     * @returns {Object} 응답 데이터
     */
    return {
        statusCode: 200,
        body: 'Hello from FaaS!'
    };
};

if (require.main === module) {
    const payload = process.env.PAYLOAD ? JSON.parse(process.env.PAYLOAD) : {};
    exports.handler(payload, {})
        .then(res => console.log(JSON.stringify(res)))
        .catch(err => console.error(err));
}`,
    cpp: `#include <iostream>
#include <string>
#include <cstdlib>

extern "C" {
    const char* handler(const char* event) {
        // FaaS Function Handler
        return "{\\"statusCode\\": 200, \\"body\\": \\"Hello from FaaS!\\"}";
    }
}

int main() {
    const char* env_payload = std::getenv("PAYLOAD");
    std::string event = env_payload ? env_payload : "{}";
    std::cout << handler(event.c_str()) << std::endl;
    return 0;
}`,
    go: `package main

import (
    "encoding/json"
    "fmt"
    "os"
)

type Response struct {
    StatusCode int    \`json:"statusCode"\`
    Body       string \`json:"body"\`
}

func Handler(event map[string]interface{}) (Response, error) {
    // FaaS Function Handler
    return Response{
        StatusCode: 200,
        Body:       "Hello from FaaS!",
    }, nil
}

func main() {
    payload := os.Getenv("PAYLOAD")
    var event map[string]interface{}
    if payload != "" {
        json.Unmarshal([]byte(payload), &event)
    }
    
    res, _ := Handler(event)
    output, _ := json.Marshal(res)
    fmt.Println(string(output))
}`
  };

  // Check if handler should be disabled (C++ or Go)
  const isHandlerDisabled = formData.language === 'cpp' || formData.language === 'go';

  const handleLanguageChange = (langId: string) => {
    const lang = languages.find(l => l.id === langId);
    const isBinaryLanguage = langId === 'cpp' || langId === 'go';

    setFormData({
      ...formData,
      language: langId,
      runtime: lang?.runtime || '',
      handler: isBinaryLanguage ? 'main' : 'handler.main',
      code: codeTemplates[langId] || ''
    });
  };

  const addEnvVar = () => {
    setFormData({
      ...formData,
      envVars: [...formData.envVars, { key: '', value: '' }]
    });
  };

  const updateEnvVar = (index: number, field: 'key' | 'value', value: string) => {
    const newEnvVars = [...formData.envVars];
    newEnvVars[index][field] = value;
    setFormData({ ...formData, envVars: newEnvVars });
  };

  const removeEnvVar = (index: number) => {
    const newEnvVars = formData.envVars.filter((_, i) => i !== index);
    setFormData({ ...formData, envVars: newEnvVars });
  };

  const handleDeploy = async () => {
    setShowDeploymentModal(true);
    setDeploymentStep(0);

    let deploymentFailed = false;

    try {
      // Step 1: Code Packaging & Upload (Real Upload)
      // Sending FormData to /upload endpoint

      // Step 1: Upload & Deploy
      setDeploymentStep(1); // "Packaging & Upload" visual

      const formDataToSend = new FormData();
      // Real ZIP Compression using JSZip
      const zip = new JSZip();

      // Determine filename based on runtime
      const filenameMap: Record<string, string> = {
        'python': 'main.py',
        'nodejs': 'index.js',
        'cpp': 'main.cpp',
        'go': 'main.go'
      };

      // Default to python if unknown, but we have strict types locally
      const codeFilename = filenameMap[formData.language] || 'main.txt';
      zip.file(codeFilename, formData.code);

      // Generate Zip Blob
      const blob = await zip.generateAsync({ type: 'blob' });
      const file = new File([blob], 'function.zip', { type: 'application/zip' });

      formDataToSend.append('file', file);
      formDataToSend.append('functionId', formData.name);
      formDataToSend.append('runtime', formData.runtime);
      formDataToSend.append('memoryMb', formData.memory.toString());
      // TODO: Implement Environment Variables transmission
      // formData.envVars needs to be sent as JSON or individual fields
      // formDataToSend.append('envVars', JSON.stringify(formData.envVars));

      // Use configured API URL or Fallback

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://16.184.11.69:8080'}/upload`, {
        method: 'POST',
        headers: {
          'x-api-key': 'test-api-key',
          'x-runtime': formData.language,
          'x-memory-mb': formData.memory.toString(),
          'x-function-name': encodeURIComponent(formData.name)
        },
        body: formDataToSend
      });


      if (!response.ok) {
        throw new Error(`Upload Failed: ${response.statusText}`);
      }

      const result = await response.json();
      if (result.functionId) {
        setDeployedFunctionId(result.functionId);
      }

      // Step 2-4: Success Flow (Immediate transition as backend handles registration)
      setDeploymentStep(2);
      setDeploymentStep(3);
      setDeploymentStep(4);

      setShowDeploymentModal(false);
      setShowSuccessModal(true);

    } catch (error: any) {
      console.error('Deployment error:', error);
      deploymentFailed = true;
      setFailureInfo({
        step: 1,
        message: error.message || 'Deployment Failed',
        detail: 'Backend Upload failed'
      });
      setShowDeploymentModal(false);
      setShowFailureModal(true);
    }
  };



  const handleRetryDeploy = () => {
    setShowFailureModal(false);
    setDeploymentStep(0);
    handleDeploy();
  };

  const handleCancelDeploy = () => {
    setShowFailureModal(false);
    setCurrentStep(3);
  };

  const handleCloseModal = () => {
    setShowSuccessModal(false);
    navigate('/dashboard');
  };

  const handleCloseBuildError = () => {
    setShowBuildErrorModal(false);
    setCurrentStep(2);
  };

  const handleCloseWarning = () => {
    setShowWarningModal(false);
    navigate('/dashboard');
  };

  const handleFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      alert('파일 크기가 너무 큽니다. 1MB 이하의 파일만 업로드 가능합니다.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setFormData({ ...formData, code: content });
    };
    reader.onerror = () => {
      alert('파일을 읽는 중 오류가 발생했습니다.');
    };
    reader.readAsText(file);
  };

  const getFileExtension = () => {
    const extensions: Record<string, string> = {
      'python': '.py',
      'nodejs': '.js',
      'cpp': '.cpp',
      'go': '.go'
    };
    return extensions[formData.language] || '.txt';
  };

  const handleGithubConnect = () => {
    setShowGithubModal(true);
  };

  const handleGithubImport = () => {
    const sampleCode = codeTemplates[formData.language];
    setFormData({ ...formData, code: sampleCode });
    setShowGithubModal(false);
    setGithubUrl('');
    setGithubBranch('main');
    setGithubFilePath('');
  };

  const handleTestRun = async () => {
    if (!deployedFunctionId) {
      alert("배포된 함수 ID를 찾을 수 없습니다.");
      return;
    }

    setTestRunning(true);
    setActiveTestTab('result');

    try {
      const payload = JSON.parse(testInput);
      const startTime = Date.now();
      const result: any = await functionApi.invokeFunction(deployedFunctionId, payload);
      const endTime = Date.now();

      // Fix: Handle Worker response format (exitCode/status) vs HTTP format (statusCode)
      const isSuccess = result.status === 'SUCCESS' || (result.statusCode >= 200 && result.statusCode < 300);
      const statusCode = result.statusCode || (result.exitCode === 0 ? 200 : 500);

      setTestResult({
        success: isSuccess,
        statusCode: statusCode,
        responseTime: endTime - startTime,
        memoryUsed: result.peakMemoryBytes ? Math.round(result.peakMemoryBytes / 1024 / 1024) + ' MB' : 'N/A',
        output: result.stdout || result.body || (typeof result === 'string' ? result : JSON.stringify(result, null, 2)),
        metrics: {
          cpu: 0,
          memory: result.peakMemoryBytes || 0,
          network: 0,
          disk: 0
        }
      });
    } catch (error: any) {
      console.error("Test run failed", error);
      setTestResult({
        success: false,
        statusCode: 500,
        responseTime: 0,
        memoryUsed: 0,
        output: JSON.stringify({ error: error.message || "Execution Failed" }, null, 2),
        metrics: { cpu: 0, memory: 0, network: 0, disk: 0 }
      });
    } finally {
      setTestRunning(false);
    }
  };

  const deploymentSteps = [
    {
      icon: 'ri-package-line',
      title: '📦 Code Packaging & Upload',
      description: '소스 코드를 압축하여 S3 보안 버킷에 저장합니다.',
      detail: `s3://code-bucket/${formData.name}/v1.zip 업로드 중...`,
      color: 'from-blue-400 to-cyan-400',
      errorMessages: [
        '코드 압축 중 오류가 발생했습니다.',
        'S3 버킷 연결에 실패했습니다.',
        '파일 크기가 너무 큽니다 (최대 50MB).',
        '네트워크 연결이 불안정합니다.'
      ]
    },
    {
      icon: 'ri-file-list-3-line',
      title: '📝 Metadata Registration',
      description: 'DynamoDB에 함수 설정(메모리, 런타임)을 기록합니다.',
      detail: '함수 ID 및 설정값 등록 중...',
      color: 'from-purple-400 to-pink-400',
      errorMessages: [
        'DynamoDB 연결에 실패했습니다.',
        '중복된 함수명이 존재합니다.',
        '메타데이터 형식이 올바르지 않습니다.',
        '권한이 부족합니다.'
      ]
    },
    {
      icon: 'ri-rocket-line',
      title: '🚀 Optimizing for Warm Start',
      description: '실행 지연 제거를 위해 소스 코드를 Worker에 미리 전송(Pre-load)합니다.',
      detail: 'Warm Pool에 컨테이너 예열 신호 전송 중...',
      color: 'from-orange-400 to-red-400',
      highlight: true,
      errorMessages: [
        'Worker Node와 통신에 실패했습니다.',
        '컨테이너 이미지를 가져올 수 없습니다.',
        'Warm Pool이 현재 사용 불가능합니다.',
        '런타임 환경 초기화에 실패했습니다.'
      ]
    },
    {
      icon: 'ri-checkbox-circle-line',
      title: '✅ Ready to Run',
      description: '배포 완료! 예상 Cold Start 시간: 0ms',
      detail: 'Warm Pool에 의해 보호되고 있습니다.',
      color: 'from-green-400 to-emerald-400',
      errorMessages: []
    }
  ];

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-gray-100">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-6 py-8">
            {/* Progress Steps */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                {[1, 2, 3].map((s) => (
                  <div key={s} className="flex items-center flex-1">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${currentStep >= s ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md' : 'bg-white text-gray-400 border-2 border-gray-200'
                      }`}>
                      {s}
                    </div>
                    {s < 3 && (
                      <div className={`flex-1 h-1 mx-4 transition-all rounded-full ${currentStep > s ? 'bg-gradient-to-r from-blue-600 to-purple-600' : 'bg-gray-200'
                        }`}></div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-between">
                <span className={`text-sm flex-1 text-center ${currentStep >= 1 ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>기본 설정</span>
                <span className={`text-sm flex-1 text-center ${currentStep >= 2 ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>코드 작성</span>
                <span className={`text-sm flex-1 text-center ${currentStep >= 3 ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>배포 확인</span>
              </div>
            </div>

            {/* Step 1: Basic Configuration */}
            {currentStep === 1 && (
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200 p-8 shadow-sm">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">기본 설정</h2>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      함수명
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="my-function"
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all"
                    />
                    <p className="mt-2 text-xs text-gray-500">소문자, 숫자, 하이픈만 사용 가능합니다</p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      핸들러 (Handler)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={formData.handler}
                        onChange={(e) => !isHandlerDisabled && setFormData({ ...formData, handler: e.target.value })}
                        placeholder="handler.main"
                        disabled={isHandlerDisabled}
                        className={`w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all ${isHandlerDisabled
                          ? 'bg-gray-100 text-gray-600 cursor-not-allowed'
                          : 'bg-white'
                          }`}
                      />
                      {isHandlerDisabled && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                          <i className="ri-lock-line text-gray-400 text-lg"></i>
                        </div>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      {isHandlerDisabled
                        ? '바이너리 실행 파일이므로 main 함수가 자동으로 실행됩니다.'
                        : '진입점 함수를 입력하세요 (예: handler.main, index.handler)'}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-3">
                      프로그래밍 언어 (Runtime)
                    </label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {languages.map((lang) => (
                        <button
                          key={lang.id}
                          onClick={() => handleLanguageChange(lang.id)}
                          className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${formData.language === lang.id
                            ? 'border-blue-400 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-md'
                            : 'border-gray-200 bg-white hover:border-gray-200 hover:shadow-sm'
                            }`}
                        >
                          <i className={`${lang.icon} text-3xl mb-2 ${formData.language === lang.id ? 'text-blue-600' : 'text-gray-600'
                            }`}></i>
                          <div className={`text-sm font-semibold mb-1 ${formData.language === lang.id ? 'text-blue-600' : 'text-gray-700'
                            }`}>
                            {lang.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {lang.version}
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-xs text-gray-600 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg px-3 py-2">
                      <i className="ri-information-line text-blue-600"></i>
                      <span>최신 안정 버전({languages.find(l => l.id === formData.language)?.version})이 자동으로 적용됩니다</span>
                    </div>
                  </div>

                  {/* Warm Pool Section */}
                  <div className="bg-gradient-to-br from-orange-50 to-red-50 border-2 border-orange-300 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-red-400 rounded-full flex items-center justify-center">
                          <i className="ri-fire-fill text-xl text-white"></i>
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">⚡ 성능 옵션 (Performance)</h3>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.warmPoolEnabled}
                          onChange={(e) => setFormData({ ...formData, warmPoolEnabled: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-14 h-7 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-orange-400 peer-checked:to-red-400"></div>
                      </label>
                    </div>

                    <div className="bg-white/80 rounded-lg p-4 border border-orange-200">
                      <div className="flex items-start gap-3">
                        <i className="ri-flashlight-fill text-orange-600 text-xl flex-shrink-0 mt-0.5"></i>
                        <div>
                          <h4 className="text-sm font-semibold text-orange-900 mb-1">🔥 Warm Pool 활성화 (Cold Start 방지)</h4>
                          <p className="text-xs text-orange-800">
                            미리 컨테이너를 대기시켜 실행 지연을 제거합니다. Cold Start를 <strong>0ms</strong>로 유지합니다.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        메모리 (MB)
                      </label>
                      <select
                        value={formData.memory}
                        onChange={(e) => setFormData({ ...formData, memory: Number(e.target.value) })}
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                      >
                        {memoryOptions.map((mem) => (
                          <option key={mem} value={mem}>{mem} MB</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        타임아웃 (초)
                      </label>
                      <select
                        value={formData.timeout}
                        onChange={(e) => setFormData({ ...formData, timeout: Number(e.target.value) })}
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                      >
                        <option value="10">10초</option>
                        <option value="30">30초</option>
                        <option value="60">60초</option>
                      </select>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-gray-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <i className="ri-lightbulb-line text-blue-600 text-xl flex-shrink-0 mt-0.5"></i>
                      <div>
                        <h4 className="text-sm font-semibold text-blue-900 mb-1">💡 Auto-Tuner 추천</h4>
                        <p className="text-sm text-blue-800 mb-2">
                          첫 실행 후 최적 스펙을 자동으로 분석하여 추천해드립니다.
                        </p>
                        <div className="text-sm text-blue-700">
                          예상 비용 절감: <strong>최대 85%</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Environment Variables */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-3">
                      🔑 환경 변수 (Environment Variables)
                    </label>
                    <div className="space-y-3">
                      {formData.envVars.map((envVar, index) => (
                        <div key={index} className="flex gap-3">
                          <input
                            type="text"
                            value={envVar.key}
                            onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
                            placeholder="DB_HOST"
                            className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                          />
                          <input
                            type="text"
                            value={envVar.value}
                            onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                            placeholder="localhost:5432"
                            className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                          />
                          <button
                            onClick={() => removeEnvVar(index)}
                            className="w-12 h-12 flex items-center justify-center bg-red-50 border border-red-200 text-red-600 rounded-xl hover:bg-red-100 transition-all cursor-pointer"
                          >
                            <i className="ri-delete-bin-line text-lg"></i>
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={addEnvVar}
                        className="w-full px-6 py-3 bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-dashed border-purple-300 text-blue-600 font-semibold rounded-xl hover:bg-gradient-to-br hover:from-blue-100 hover:to-indigo-100 transition-all cursor-pointer flex items-center justify-center gap-2"
                      >
                        <i className="ri-add-line text-xl"></i>
                        변수 추가
                      </button>
                    </div>
                    <p className="mt-3 text-xs text-gray-500">API Key, DB URL 등 민감한 정보를 안전하게 관리합니다</p>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-8">
                  <button
                    onClick={() => navigate('/dashboard')}
                    className="px-6 py-3 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all whitespace-nowrap cursor-pointer"
                  >
                    취소
                  </button>
                  <button
                    onClick={() => setCurrentStep(2)}
                    disabled={!formData.name}
                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    다음 단계 (코드 작성)
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Code Editor */}
            {currentStep === 2 && (
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200 p-8 shadow-sm">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">코드 작성</h2>

                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-semibold text-gray-700">
                      함수 코드
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={getFileExtension()}
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <button
                        onClick={handleFileUpload}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-all whitespace-nowrap cursor-pointer"
                      >
                        <i className="ri-file-upload-line mr-1"></i>
                        파일 업로드
                      </button>
                      <button
                        onClick={handleGithubConnect}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-all whitespace-nowrap cursor-pointer"
                      >
                        <i className="ri-github-line mr-1"></i>
                        GitHub 연동
                      </button>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="bg-gray-900 px-4 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-400"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                        <div className="w-3 h-3 rounded-full bg-green-400"></div>
                        <span className="ml-3 text-gray-400 text-xs">handler.{formData.language === 'python' ? 'py' : formData.language === 'nodejs' ? 'js' : formData.language === 'cpp' ? 'cpp' : 'go'}</span>
                      </div>
                      <span className="text-gray-400 text-xs">{formData.language}</span>
                    </div>
                    <textarea
                      value={formData.code || codeTemplates[formData.language]}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      className="w-full h-96 p-4 bg-gray-900 text-gray-100 font-mono text-sm focus:outline-none resize-none"
                      style={{ fontFamily: 'Monaco, Consolas, monospace' }}
                    />
                  </div>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <i className="ri-information-line text-blue-600 text-xl flex-shrink-0 mt-0.5"></i>
                    <div>
                      <h4 className="text-sm font-semibold text-blue-900 mb-1">함수 작성 가이드</h4>
                      <ul className="text-sm text-blue-800 space-y-1">
                        <li>• handler 함수는 event와 context를 매개변수로 받습니다</li>
                        <li>• 반환값은 statusCode와 body를 포함해야 합니다</li>
                        <li>• 외부 라이브러리는 requirements.txt에 명시하세요</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between gap-3">
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="px-6 py-3 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all whitespace-nowrap cursor-pointer"
                  >
                    이전 단계
                  </button>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowTestModal(true)}
                      className="px-6 py-3 bg-white border-2 border-blue-400 text-blue-600 font-semibold rounded-xl hover:bg-blue-50 transition-all whitespace-nowrap cursor-pointer"
                    >
                      테스트 실행
                    </button>
                    <button
                      onClick={() => setCurrentStep(3)}
                      className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all whitespace-nowrap cursor-pointer"
                    >
                      다음 단계
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Deploy Confirmation */}
            {currentStep === 3 && (
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200 p-8 shadow-sm">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">배포 확인</h2>

                <div className="space-y-6 mb-8">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 border border-gray-200">
                      <div className="text-sm text-gray-600 mb-1">함수명</div>
                      <div className="font-semibold text-gray-900">{formData.name}</div>
                    </div>
                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 border border-gray-200">
                      <div className="text-sm text-gray-600 mb-1">핸들러</div>
                      <div className="font-semibold text-gray-900">{formData.handler}</div>
                    </div>
                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 border border-gray-200">
                      <div className="text-sm text-gray-600 mb-1">언어 / 런타임</div>
                      <div className="font-semibold text-gray-900">
                        {languages.find(l => l.id === formData.language)?.name} {languages.find(l => l.id === formData.language)?.version}
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 border border-gray-200">
                      <div className="text-sm text-gray-600 mb-1">Warm Pool</div>
                      <div className="font-semibold text-gray-900">
                        {formData.warmPoolEnabled ? '✅ 활성화' : '❌ 비활성화'}
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 border border-gray-200">
                      <div className="text-sm text-gray-600 mb-1">메모리</div>
                      <div className="font-semibold text-gray-900">{formData.memory} MB</div>
                    </div>
                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 border border-gray-200">
                      <div className="text-sm text-gray-600 mb-1">타임아웃</div>
                      <div className="font-semibold text-gray-900">{formData.timeout}초</div>
                    </div>
                  </div>

                  {formData.envVars.length > 0 && (
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
                      <div className="text-sm font-semibold text-gray-700 mb-3">환경 변수 ({formData.envVars.length}개)</div>
                      <div className="space-y-2">
                        {formData.envVars.map((envVar, index) => (
                          <div key={index} className="flex items-center gap-3 text-sm">
                            <span className="font-mono text-blue-900">{envVar.key}</span>
                            <span className="text-gray-400">=</span>
                            <span className="font-mono text-gray-600">****************</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <i className="ri-lightbulb-line text-purple-600 text-xl flex-shrink-0 mt-0.5"></i>
                      <div>
                        <h4 className="text-sm font-semibold text-purple-900 mb-1">Auto-Tuner 추천</h4>
                        <p className="text-sm text-purple-800 mb-2">
                          첫 실행 후 최적 스펙을 자동으로 분석하여 추천해드립니다.
                        </p>
                        <div className="text-sm text-purple-700">
                          예상 비용 절감: <strong>최대 85%</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between gap-3">
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="px-6 py-3 bg-white border border-purple-200 text-gray-700 font-semibold rounded-xl hover:bg-purple-50 transition-all whitespace-nowrap cursor-pointer"
                  >
                    이전 단계
                  </button>
                  <button
                    onClick={handleDeploy}
                    className="px-8 py-3 bg-gradient-to-r from-purple-400 to-pink-400 text-white font-semibold rounded-xl hover:shadow-lg transition-all whitespace-nowrap cursor-pointer flex items-center gap-2"
                  >
                    <i className="ri-rocket-line"></i>
                    배포 시작
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Deployment Progress Modal */}
      {showDeploymentModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8 relative">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">⚡ Function Deployment</h3>
              <p className="text-gray-600">함수 배포 중...</p>
            </div>

            <div className="space-y-6">
              {deploymentSteps.map((step, index) => (
                <div
                  key={index}
                  className={`relative border-2 rounded-xl p-5 transition-all duration-500 ${deploymentStep > index
                    ? 'border-green-400 bg-green-50'
                    : deploymentStep === index
                      ? `border-transparent bg-gradient-to-r ${step.color} shadow-lg`
                      : 'border-gray-200 bg-gray-50 opacity-50'
                    }`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${deploymentStep > index
                        ? 'bg-green-500'
                        : deploymentStep === index
                          ? 'bg-white'
                          : 'bg-gray-300'
                        }`}
                    >
                      {deploymentStep > index ? (
                        <i className="ri-check-line text-2xl text-white"></i>
                      ) : (
                        <i
                          className={`${step.icon} text-2xl ${deploymentStep === index ? 'text-gray-900' : 'text-gray-500'
                            }`}
                        ></i>
                      )}
                    </div>

                    <div className="flex-1">
                      <h4
                        className={`text-lg font-bold mb-1 ${deploymentStep >= index ? 'text-gray-900' : 'text-gray-500'
                          }`}
                      >
                        {step.title}
                      </h4>
                      <p
                        className={`text-sm mb-2 ${deploymentStep >= index ? 'text-gray-700' : 'text-gray-400'
                          }`}
                      >
                        {step.description}
                      </p>
                      {deploymentStep === index && (
                        <div className="mt-3">
                          <div className="text-xs font-mono text-gray-600 mb-2">{step.detail}</div>
                          {index < 3 && (
                            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                              <div className="bg-gradient-to-r from-purple-500 to-pink-500 h-full rounded-full animate-progress"></div>
                            </div>
                          )}
                        </div>
                      )}
                      {step.highlight && deploymentStep === index && (
                        <div className="mt-3 bg-white/90 rounded-lg p-3 border border-orange-200">
                          <div className="flex items-center gap-2 text-sm font-semibold text-orange-900">
                            <i className="ri-star-fill text-orange-500"></i>
                            <span>핵심 기능: Cold Start 제거</span>
                          </div>
                          <p className="text-xs text-orange-800 mt-1">
                            Worker Node와 통신하여 컨테이너를 미리 준비합니다.
                          </p>
                        </div>
                      )}
                    </div>

                    {deploymentStep > index && (
                      <div className="flex-shrink-0">
                        <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-1 rounded-full">
                          완료
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {deploymentStep === 4 && (
              <div className="mt-6 text-center">
                <div className="inline-flex items-center gap-2 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-400 rounded-xl px-6 py-3">
                  <i className="ri-shield-check-line text-2xl text-green-600"></i>
                  <span className="font-bold text-green-900">
                    NanoGrid Warm Pool에 의해 보호되고 있습니다
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* GitHub Connect Modal */}
      {showGithubModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8 relative animate-scale-in">
            <button
              onClick={() => setShowGithubModal(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <i className="ri-close-line text-xl text-gray-600"></i>
            </button>

            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <i className="ri-github-fill text-3xl text-white"></i>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">GitHub 저장소 연동</h3>
              <p className="text-gray-600 text-sm">
                GitHub 저장소에서 코드를 가져옵니다
              </p>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  저장소 URL
                </label>
                <input
                  type="text"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/username/repository"
                  className="w-full px-4 py-3 bg-white border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  브랜치
                </label>
                <select
                  value={githubBranch}
                  onChange={(e) => setGithubBranch(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 transition-all text-sm"
                >
                  <option value="main">main</option>
                  <option value="master">master</option>
                  <option value="develop">develop</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  파일 경로
                </label>
                <input
                  type="text"
                  value={githubFilePath}
                  onChange={(e) => setGithubFilePath(e.target.value)}
                  placeholder="src/handler.py"
                  className="w-full px-4 py-3 bg-white border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all text-sm"
                />
              </div>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <i className="ri-information-line text-blue-600 text-lg flex-shrink-0 mt-0.5"></i>
                <div>
                  <h4 className="text-sm font-semibold text-blue-900 mb-1">안내사항</h4>
                  <ul className="text-xs text-blue-800 space-y-1">
                    <li>• Public 저장소만 연동 가능합니다</li>
                    <li>• Private 저장소는 Personal Access Token이 필요합니다</li>
                    <li>• 파일 경로는 저장소 루트 기준입니다</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowGithubModal(false)}
                className="flex-1 px-6 py-3 bg-white border border-purple-200 text-gray-700 font-semibold rounded-xl hover:bg-purple-50 transition-all whitespace-nowrap cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={handleGithubImport}
                disabled={!githubUrl || !githubFilePath}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-400 to-pink-400 text-white font-semibold rounded-xl hover:shadow-lg transition-all whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <i className="ri-download-line"></i>
                코드 가져오기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Failure Modal */}
      {showFailureModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8 relative animate-scale-in">
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-red-400 to-orange-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                <i className="ri-error-warning-line text-4xl text-white"></i>
              </div>

              <h3 className="text-2xl font-bold text-gray-900 mb-3">배포 실패</h3>
              <p className="text-gray-600 mb-6">
                배포 과정 중 오류가 발생했습니다.
              </p>

              {/* Failed Step Info */}
              <div className="bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-300 rounded-xl p-5 mb-6 text-left">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <i className={`${deploymentSteps[failureInfo.step].icon} text-xl text-white`}></i>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-red-900 mb-1">
                      {deploymentSteps[failureInfo.step].title}
                    </h4>
                    <p className="text-sm text-red-800">
                      {deploymentSteps[failureInfo.step].description}
                    </p>
                  </div>
                </div>

                <div className="bg-white/80 rounded-lg p-4 border border-red-200">
                  <div className="flex items-start gap-2 mb-2">
                    <i className="ri-close-circle-line text-red-600 text-lg flex-shrink-0 mt-0.5"></i>
                    <div>
                      <div className="font-semibold text-red-900 text-sm mb-1">오류 메시지</div>
                      <div className="text-sm text-red-800">{failureInfo.message}</div>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-red-200">
                    <div className="text-xs font-mono text-red-700 break-all">
                      {failureInfo.detail}
                    </div>
                  </div>
                </div>
              </div>

              {/* Troubleshooting Tips */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 mb-6 text-left">
                <div className="flex items-start gap-3">
                  <i className="ri-lightbulb-line text-blue-600 text-xl flex-shrink-0 mt-0.5"></i>
                  <div>
                    <h4 className="text-sm font-semibold text-blue-900 mb-2">해결 방법</h4>
                    <ul className="text-sm text-blue-800 space-y-1">
                      {failureInfo.step === 0 && (
                        <>
                          <li>• 코드 파일 크기를 확인해주세요 (최대 50MB)</li>
                          <li>• 네트워크 연결 상태를 확인해주세요</li>
                          <li>• 잠시 후 다시 시도해주세요</li>
                        </>
                      )}
                      {failureInfo.step === 1 && (
                        <>
                          <li>• 함수명이 중복되지 않았는지 확인해주세요</li>
                          <li>• 설정값이 올바른지 확인해주세요</li>
                          <li>• 계정 권한을 확인해주세요</li>
                        </>
                      )}
                      {failureInfo.step === 2 && (
                        <>
                          <li>• Worker Node 상태를 확인 중입니다</li>
                          <li>• 런타임 환경을 다시 선택해주세요</li>
                          <li>• 시스템 관리자에게 문의해주세요</li>
                        </>
                      )}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleRetryDeploy}
                  className="w-full px-6 py-3 bg-gradient-to-r from-purple-400 to-pink-400 text-white font-semibold rounded-xl hover:shadow-lg transition-all whitespace-nowrap cursor-pointer flex items-center justify-center gap-2"
                >
                  <i className="ri-refresh-line text-xl"></i>
                  다시 시도
                </button>
                <button
                  onClick={handleCancelDeploy}
                  className="w-full px-6 py-3 bg-white border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all whitespace-nowrap cursor-pointer"
                >
                  취소
                </button>
              </div>

              {/* Support Link */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="text-sm text-gray-600">
                  문제가 계속되면{' '}
                  <a href="#" className="text-purple-600 font-semibold hover:underline">
                    고객 지원팀
                  </a>
                  에 문의하세요
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 relative animate-scale-in">
            <button
              onClick={handleCloseModal}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <i className="ri-close-line text-xl text-gray-600"></i>
            </button>

            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                <i className="ri-check-line text-4xl text-white"></i>
              </div>

              <h3 className="text-2xl font-bold text-gray-900 mb-3">배포 완료!</h3>
              <p className="text-gray-600 mb-4">
                함수가 성공적으로 배포되었습니다.
              </p>

              <div className="bg-gradient-to-br from-orange-50 to-red-50 border-2 border-orange-300 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <i className="ri-flashlight-fill text-orange-600 text-xl"></i>
                  <span className="font-bold text-orange-900">예상 Cold Start 시간</span>
                </div>
                <div className="text-4xl font-black text-orange-600">0ms</div>
                <p className="text-xs text-orange-800 mt-2">
                  Warm Pool 덕분에 즉시 실행 가능합니다
                </p>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 mb-6 border border-gray-200">
                <div className="text-sm text-gray-600 mb-2">함수 이름</div>
                <div className="font-semibold text-gray-900">{formData.name}</div>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    setShowSuccessModal(false);
                    navigate(`/function/${deployedFunctionId}`);
                  }}
                  className="w-full px-6 py-3 bg-gradient-to-r from-purple-400 to-pink-400 text-white font-semibold rounded-xl hover:shadow-lg transition-all whitespace-nowrap cursor-pointer flex items-center justify-center gap-2"
                >
                  <i className="ri-play-circle-line text-xl"></i>
                  ⚡ 바로 실행하기 (Test Run)
                </button>
                <button
                  onClick={handleCloseModal}
                  className="w-full px-6 py-3 bg-white border border-purple-200 text-gray-700 font-semibold rounded-xl hover:bg-purple-50 transition-all whitespace-nowrap cursor-pointer"
                >
                  대시보드로 이동
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Build Error Modal */}
      {showBuildErrorModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8 relative animate-scale-in">
            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-gradient-to-br from-red-400 to-orange-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                <i className="ri-tools-line text-4xl text-white"></i>
              </div>

              <h3 className="text-2xl font-bold text-gray-900 mb-3">🛠️ 빌드 실패 (Build Failed)</h3>
              <p className="text-gray-600 mb-6">
                코드 컴파일 중 오류가 발견되었습니다.
              </p>
            </div>

            {/* Error Details */}
            <div className="bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-300 rounded-xl p-5 mb-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <i className="ri-error-warning-line text-xl text-white"></i>
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-red-900 mb-1">컴파일 오류</h4>
                  <p className="text-sm text-red-800">
                    C++ 코드에서 문법 오류가 발견되어 빌드를 중단했습니다.
                  </p>
                </div>
              </div>

              {/* Terminal-style Error Log */}
              <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                <div className="text-red-400 mb-2">
                  <span className="text-gray-500">handler.cpp:</span>
                  <span className="text-yellow-400">{buildError.line}</span>
                  <span className="text-gray-500">:</span>
                  <span className="text-yellow-400">15</span>
                  <span className="text-gray-500">: </span>
                  <span className="text-red-400">error: </span>
                  <span className="text-white">{buildError.message}</span>
                </div>
                <div className="text-gray-400 mb-1">
                  {buildError.line - 1}  |  const char* result = process(event);
                </div>
                <div className="text-white mb-1">
                  {buildError.line}  |  {buildError.code}
                </div>
                <div className="text-gray-400 mb-3">
                  {buildError.line + 1}  |  {'}'}
                </div>
                <div className="text-green-400">
                  <span className="text-gray-500">^</span>
                  <span className="text-gray-500 ml-2">여기에 문법 오류가 있습니다</span>
                </div>
              </div>
            </div>

            {/* Troubleshooting Tips */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <i className="ri-lightbulb-line text-blue-600 text-xl flex-shrink-0 mt-0.5"></i>
                <div>
                  <h4 className="text-sm font-semibold text-blue-900 mb-2">해결 방법</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• 코드 편집기로 돌아가 {buildError.line}번째 줄을 확인하세요</li>
                    <li>• 세미콜론(;), 괄호(), 중괄호{'{}'} 누락 여부를 점검하세요</li>
                    <li>• 함수 선언과 정의가 일치하는지 확인하세요</li>
                    <li>• 필요한 헤더 파일(#include)이 모두 포함되었는지 확인하세요</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-3">
              <button
                onClick={handleCloseBuildError}
                className="w-full px-6 py-3 bg-gradient-to-r from-purple-400 to-pink-400 text-white font-semibold rounded-xl hover:shadow-lg transition-all whitespace-nowrap cursor-pointer flex items-center justify-center gap-2"
              >
                <i className="ri-code-line text-xl"></i>
                코드 수정하러 가기
              </button>
              <button
                onClick={() => setShowBuildErrorModal(false)}
                className="w-full px-6 py-3 bg-white border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all whitespace-nowrap cursor-pointer"
              >
                닫기
              </button>
            </div>

            {/* Support Link */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-sm text-gray-600 text-center">
                💡 NanoGrid는 배포 전 자동으로 코드를 검증하여 런타임 오류를 방지합니다
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Warning Modal (Partial Success) */}
      {showWarningModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8 relative animate-scale-in">
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-yellow-400 to-orange-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                <i className="ri-error-warning-line text-4xl text-white"></i>
              </div>

              <h3 className="text-2xl font-bold text-gray-900 mb-3">⚠️ 배포 완료 (경고)</h3>
              <p className="text-gray-600 mb-6">
                함수는 배포되었으나 예열에 실패했습니다.
              </p>

              {/* Warning Details */}
              <div className="bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-300 rounded-xl p-5 mb-6 text-left">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 bg-yellow-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <i className="ri-time-line text-xl text-white"></i>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-yellow-900 mb-1">Warm Pool 할당 지연</h4>
                    <p className="text-sm text-yellow-800">
                      현재 사용자가 많아 컨테이너 예열이 지연되고 있습니다.
                    </p>
                  </div>
                </div>

                <div className="bg-white/80 rounded-lg p-4 border border-yellow-200">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-gray-700">예상 Cold Start 시간</span>
                    <span className="text-2xl font-bold text-yellow-600">~150ms</span>
                  </div>
                  <div className="text-xs text-gray-600">
                    첫 실행 시 컨테이너 초기화로 인한 지연이 발생할 수 있습니다.
                  </div>
                </div>
              </div>

              {/* Info Box */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 mb-6 text-left">
                <div className="flex items-start gap-3">
                  <i className="ri-information-line text-blue-600 text-xl flex-shrink-0 mt-0.5"></i>
                  <div>
                    <h4 className="text-sm font-semibold text-blue-900 mb-2">안내사항</h4>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>• 함수는 정상적으로 작동하며 DynamoDB에 등록되었습니다</li>
                      <li>• 몇 분 후 자동으로 Warm Pool에 추가될 예정입니다</li>
                      <li>• 두 번째 실행부터는 0ms Cold Start가 보장됩니다</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Function Info */}
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 mb-6 border border-gray-200">
                <div className="text-sm text-gray-600 mb-2">배포된 함수</div>
                <div className="font-semibold text-gray-900">{formData.name}</div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    setShowWarningModal(false);
                    navigate(`/function/${deployedFunctionId}`);
                  }}
                  className="w-full px-6 py-3 bg-gradient-to-r from-purple-400 to-pink-400 text-white font-semibold rounded-xl hover:shadow-lg transition-all whitespace-nowrap cursor-pointer flex items-center justify-center gap-2"
                >
                  <i className="ri-play-circle-line text-xl"></i>
                  🐢 실행하기 (Cold Start 예상)
                </button>
                <button
                  onClick={handleCloseWarning}
                  className="w-full px-6 py-3 bg-white border border-purple-200 text-gray-700 font-semibold rounded-xl hover:bg-purple-50 transition-all whitespace-nowrap cursor-pointer"
                >
                  대시보드로 이동
                </button>
              </div>

              {/* Note */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="text-sm text-gray-600">
                  💡 NanoGrid Warm Pool은 사용 패턴을 학습하여 자동으로 최적화됩니다
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Test Modal */}
      {showTestModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-purple-400 to-pink-400 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                  <i className="ri-flask-line text-2xl text-white"></i>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">함수 테스트</h3>
                  <p className="text-sm text-white/80">{formData.name}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowTestModal(false);
                  setTestResult(null);
                  setActiveTestTab('input');
                }}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-2xl text-white"></i>
              </button>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 bg-gray-50 px-6">
              <div className="flex gap-1">
                <button
                  onClick={() => setActiveTestTab('input')}
                  className={`px-4 py-3 font-semibold text-sm transition-all cursor-pointer ${activeTestTab === 'input'
                    ? 'text-purple-600 border-b-2 border-purple-600 bg-white'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  <i className="ri-code-line mr-2"></i>
                  입력 데이터
                </button>
                <button
                  onClick={() => setActiveTestTab('result')}
                  className={`px-4 py-3 font-semibold text-sm transition-all cursor-pointer ${activeTestTab === 'result'
                    ? 'text-purple-600 border-b-2 border-purple-600 bg-white'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  <i className="ri-terminal-line mr-2"></i>
                  실행 결과
                </button>
                <button
                  onClick={() => setActiveTestTab('analysis')}
                  className={`px-4 py-3 font-semibold text-sm transition-all cursor-pointer ${activeTestTab === 'analysis'
                    ? 'text-purple-600 border-b-2 border-purple-600 bg-white'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  <i className="ri-bar-chart-line mr-2"></i>
                  상세 분석
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Input Tab */}
              {activeTestTab === 'input' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    테스트 입력 데이터 (JSON)
                  </label>
                  <textarea
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    className="w-full h-64 p-4 bg-gray-900 text-gray-100 font-mono text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none"
                    style={{ fontFamily: 'Monaco, Consolas, monospace' }}
                  />
                  <div className="mt-4 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <i className="ri-information-line text-blue-600 text-lg flex-shrink-0 mt-0.5"></i>
                      <div>
                        <h4 className="text-sm font-semibold text-blue-900 mb-1">입력 형식 안내</h4>
                        <p className="text-sm text-blue-800">
                          JSON 형식으로 테스트 데이터를 입력하세요. 함수의 event 매개변수로 전달됩니다.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Result Tab */}
              {activeTestTab === 'result' && (
                <div>
                  {testRunning ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="w-16 h-16 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-4"></div>
                      <p className="text-gray-600 font-medium">함수 실행 중...</p>
                    </div>
                  ) : testResult ? (
                    <div className="space-y-4">
                      {/* Status */}
                      <div className={`rounded-xl p-4 border-2 ${testResult.success
                        ? 'bg-green-50 border-green-300'
                        : 'bg-red-50 border-red-300'
                        }`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${testResult.success ? 'bg-green-500' : 'bg-red-500'
                            }`}>
                            <i className={`${testResult.success ? 'ri-check-line' : 'ri-close-line'
                              } text-2xl text-white`}></i>
                          </div>
                          <div>
                            <div className="font-bold text-gray-900">
                              {testResult.success ? '✅ 실행 성공' : '❌ 실행 실패'}
                            </div>
                            <div className="text-sm text-gray-600">
                              Status Code: {testResult.statusCode}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Metrics */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 border border-gray-200">
                          <div className="text-sm text-gray-600 mb-1">응답 시간</div>
                          <div className="text-2xl font-bold text-purple-600">{testResult.responseTime}ms</div>
                        </div>
                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
                          <div className="text-sm text-gray-600 mb-1">메모리 사용</div>
                          <div className="text-2xl font-bold text-blue-600">{testResult.memoryUsed}MB</div>
                        </div>
                      </div>

                      {/* Output */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          출력 결과
                        </label>
                        <div className="bg-gray-900 rounded-xl p-4 font-mono text-sm text-gray-100 overflow-x-auto">
                          <pre>{testResult.output}</pre>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                      <i className="ri-play-circle-line text-6xl mb-4"></i>
                      <p>테스트를 실행하려면 아래 버튼을 클릭하세요</p>
                    </div>
                  )}
                </div>
              )}

              {/* Analysis Tab */}
              {activeTestTab === 'analysis' && (
                <div>
                  {testResult ? (
                    <div className="space-y-6">
                      {/* Auto-Tuner Header */}
                      <div className="bg-gradient-to-r from-orange-400 to-red-400 rounded-xl p-6 text-white">
                        <div className="flex items-center gap-3 mb-2">
                          <i className="ri-fire-fill text-3xl"></i>
                          <h3 className="text-2xl font-bold">Auto-Tuner 분석</h3>
                        </div>
                        <p className="text-white/90">
                          실행 데이터를 기반으로 최적 설정을 분석합니다
                        </p>
                      </div>

                      {/* Resource Usage */}
                      <div>
                        <h4 className="text-lg font-bold text-gray-900 mb-4">리소스 사용 패턴</h4>
                        <div className="space-y-3">
                          {[
                            { label: 'CPU', value: testResult.metrics.cpu, color: 'purple', icon: 'ri-cpu-line' },
                            { label: 'Memory', value: testResult.metrics.memory, color: 'blue', icon: 'ri-database-2-line' },
                            { label: 'Network', value: testResult.metrics.network, color: 'green', icon: 'ri-global-line' },
                            { label: 'Disk I/O', value: testResult.metrics.disk, color: 'orange', icon: 'ri-hard-drive-line' }
                          ].map((metric) => (
                            <div key={metric.label} className="bg-white rounded-xl p-4 border border-gray-200">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <i className={`${metric.icon} text-${metric.color}-600`}></i>
                                  <span className="font-semibold text-gray-700">{metric.label}</span>
                                </div>
                                <span className="text-sm font-bold text-gray-900">{metric.value}%</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className={`bg-gradient-to-r from-${metric.color}-400 to-${metric.color}-600 h-2 rounded-full transition-all`}
                                  style={{ width: `${metric.value}%` }}
                                ></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Recommendations */}
                      <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl p-6">
                        <h4 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                          <i className="ri-lightbulb-line text-purple-600"></i>
                          최적화 추천
                        </h4>
                        <div className="space-y-3">
                          <div className="bg-white rounded-lg p-4 border border-gray-200">
                            <div className="flex items-start gap-3">
                              <i className="ri-arrow-down-line text-green-600 text-xl flex-shrink-0 mt-0.5"></i>
                              <div>
                                <div className="font-semibold text-gray-900 mb-1">메모리 최적화</div>
                                <div className="text-sm text-gray-600">
                                  현재 {testResult.memoryUsed}MB 사용 중입니다. 256MB로 줄여도 충분합니다.
                                </div>
                                <div className="text-sm font-semibold text-green-600 mt-2">
                                  예상 비용 절감: 50%
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-4 border border-gray-200">
                            <div className="flex items-start gap-3">
                              <i className="ri-time-line text-blue-600 text-xl flex-shrink-0 mt-0.5"></i>
                              <div>
                                <div className="font-semibold text-gray-900 mb-1">타임아웃 조정</div>
                                <div className="text-sm text-gray-600">
                                  평균 응답 시간이 {testResult.responseTime}ms입니다. 타임아웃을 10초로 줄일 수 있습니다.
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Insights */}
                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                          <i className="ri-information-line text-blue-600 text-xl flex-shrink-0 mt-0.5"></i>
                          <div>
                            <h4 className="text-sm font-semibold text-blue-900 mb-2">인사이트</h4>
                            <ul className="text-sm text-blue-800 space-y-1">
                              <li>• 함수가 효율적으로 실행되고 있습니다</li>
                              <li>• Warm Pool 활성화로 Cold Start가 제거되었습니다</li>
                              <li>• 추가 최적화로 최대 85%의 비용을 절감할 수 있습니다</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                      <i className="ri-bar-chart-line text-6xl mb-4"></i>
                      <p>테스트를 먼저 실행해주세요</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
              <div className="flex justify-between items-center">
                <button
                  onClick={() => {
                    setShowTestModal(false);
                    setTestResult(null);
                    setActiveTestTab('input');
                  }}
                  className="px-6 py-3 bg-white border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all whitespace-nowrap cursor-pointer"
                >
                  닫기
                </button>
                <button
                  onClick={handleTestRun}
                  disabled={testRunning}
                  className="px-6 py-3 bg-gradient-to-r from-purple-400 to-pink-400 text-white font-semibold rounded-xl hover:shadow-lg transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <i className="ri-play-line"></i>
                  {testRunning ? '실행 중...' : '테스트 실행'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes progress {
          0% { width: 0%; }
          100% { width: 100%; }
        }
        .animate-progress {
          animation: progress 1.5s ease-in-out infinite;
        }
        @keyframes scale-in {
          0% { transform: scale(0.9); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-scale-in {
          animation: scale-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
