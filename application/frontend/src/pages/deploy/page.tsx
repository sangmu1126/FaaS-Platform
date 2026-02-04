import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../dashboard/components/Sidebar';
import Header from '../dashboard/components/Header';
import { functionApi } from '../../services/functionApi'; // Import API
import { CONFIG } from '../../config';
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
    python: `import sdk
 
 def handler(event, context):
     """
     FaaS Function Handler
     
     Args:
         event: Input event data (JSON parsed)
         context: Execution context (Request ID, etc.)
     
     Returns:
         Response data (JSON serializable)
     """
     name = event.get("name", "World")
     return {
         'statusCode': 200,
         'body': f'Hello {name} from FaaS!'
     }
 
 # Note: Platform handles execution logic automatically.
 # You don't need "if __name__ == '__main__':" anymore.`,
    nodejs: `exports.handler = async (event, context) => {
    /**
     * FaaS Function Handler
     * 
     * @param {Object} event - Input event data
     * @param {Object} context - Execution context
     * @returns {Object} Response data
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
      // Send Environment Variables as JSON object string
      const envVarsObject = formData.envVars.reduce((acc, curr) => {
        if (curr.key) acc[curr.key] = curr.value;
        return acc;
      }, {} as Record<string, string>);
      formDataToSend.append('envVars', JSON.stringify(envVarsObject));

      // Use configured API URL or Fallback

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'}/upload`, {
        method: 'POST',
        headers: {
          'x-api-key': CONFIG.API_KEY,
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
      alert('File size is too large. Only files under 1MB can be uploaded.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setFormData({ ...formData, code: content });
    };
    reader.onerror = () => {
      alert('An error occurred while reading the file.');
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

  const [isAsyncMode, setIsAsyncMode] = useState(false);

  const handleTestRun = async () => {
    if (!deployedFunctionId) {
      alert("Deployed function ID not found.");
      return;
    }

    setTestRunning(true);
    setActiveTestTab('result');
    setTestResult(null); // Clear previous result

    try {
      const payload = JSON.parse(testInput);
      const startTime = Date.now();

      const options = isAsyncMode ? { headers: { 'x-async': 'true' } } : {};
      let result: any = await functionApi.invokeFunction(deployedFunctionId, payload, options);

      // Async Polling Logic
      if (isAsyncMode && result?.status === 'ACCEPTED' && result?.jobId) {
        const jobId = result.jobId;
        // Poll every 1s
        while (true) {
          await new Promise(r => setTimeout(r, 1000));
          const statusRes: any = await functionApi.getJobStatus(jobId);

          if (statusRes.status !== 'pending') {
            result = statusRes;
            break;
          }
          // Optional: Update UI to show we are still waiting?
          // For now, setTestRunning(true) keeps the spinner going.
        }
      }

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
      description: 'Compressing source code and storing in secure S3 bucket.',
      detail: `Uploading to s3://code-bucket/${formData.name}/v1.zip...`,
      color: 'from-blue-400 to-cyan-400',
      errorMessages: [
        'An error occurred during code compression.',
        'Failed to connect to S3 bucket.',
        'File size is too large (max 50MB).',
        'Network connection is unstable.'
      ]
    },
    {
      icon: 'ri-file-list-3-line',
      title: '📝 Metadata Registration',
      description: 'Recording function settings (memory, runtime) in DynamoDB.',
      detail: 'Registering function ID and configuration...',
      color: 'from-purple-400 to-pink-400',
      errorMessages: [
        'Failed to connect to DynamoDB.',
        'Duplicate function name exists.',
        'Metadata format is invalid.',
        'Insufficient permissions.'
      ]
    },
    {
      icon: 'ri-rocket-line',
      title: '🚀 Optimizing for Warm Start',
      description: 'Pre-loading source code to Worker for zero execution delay.',
      detail: 'Sending warm-up signal to Warm Pool...',
      color: 'from-orange-400 to-red-400',
      highlight: true,
      errorMessages: [
        'Failed to communicate with Worker Node.',
        'Unable to pull container image.',
        'Warm Pool is currently unavailable.',
        'Failed to initialize runtime environment.'
      ]
    },
    {
      icon: 'ri-checkbox-circle-line',
      title: '✅ Ready to Run',
      description: 'Deployment complete! Expected Cold Start time: 0ms',
      detail: 'Protected by Warm Pool.',
      color: 'from-green-400 to-emerald-400',
      errorMessages: []
    }
  ];

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-gray-100">
      <Sidebar systemStatus={null} onSystemStatusClick={() => { }} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-6 py-8">
            {/* Progress Steps */}
            {/* Progress Steps */}
            <div className="mb-12 relative px-4 max-w-2xl mx-auto">
              {/* Lines Container - Positioned to start/end at circle centers (approx) */}
              <div className="absolute top-5 left-0 right-0 mx-12 h-1 bg-gray-200 -z-0 rounded-full">
                {/* Active Progress Line (Inuputated inside background line) */}
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-purple-600 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${((currentStep - 1) / 2) * 100}%` }}
                ></div>
              </div>

              <div className="relative z-10 flex justify-between">
                {[
                  { step: 1, label: 'Basic Setup' },
                  { step: 2, label: 'Write Code' },
                  { step: 3, label: 'Deploy' }
                ].map((item) => (
                  <div
                    key={item.step}
                    className="flex flex-col items-center cursor-pointer group w-24"
                    onClick={() => item.step < currentStep && setCurrentStep(item.step)}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all duration-300 border-2 z-20 bg-white ${currentStep >= item.step
                      ? 'border-transparent bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg scale-110'
                      : 'text-gray-400 border-gray-200 group-hover:border-gray-300'
                      }`}>
                      {item.step}
                    </div>
                    <span className={`mt-3 text-sm font-medium transition-colors duration-300 whitespace-nowrap ${currentStep >= item.step ? 'text-blue-600' : 'text-gray-400'
                      }`}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Step 1: Basic Configuration */}
            {currentStep === 1 && (
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200 p-8 shadow-sm">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Basic Setup</h2>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Function Name
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="my-function"
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all"
                    />
                    <p className="mt-2 text-xs text-gray-500">Only lowercase letters, numbers, and hyphens allowed</p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Handler
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
                        ? 'Binary executable, main function runs automatically.'
                        : 'Enter the entry point function (e.g., handler.main, index.handler)'}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-3">
                      Runtime (Programming Language)
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
                      <span>Latest stable version ({languages.find(l => l.id === formData.language)?.version}) is automatically applied</span>
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
                          <h3 className="text-lg font-bold text-gray-900">⚡ Performance Options</h3>
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
                          <h4 className="text-sm font-semibold text-orange-900 mb-1">🔥 Enable Warm Pool (Prevent Cold Start)</h4>
                          <p className="text-xs text-orange-800">
                            Pre-warm containers to eliminate execution delays. Keeps Cold Start at <strong>0ms</strong>.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Memory (MB)
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
                        Timeout (seconds)
                      </label>
                      <select
                        value={formData.timeout}
                        onChange={(e) => setFormData({ ...formData, timeout: Number(e.target.value) })}
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                      >
                        <option value="10">10 sec</option>
                        <option value="30">30 sec</option>
                        <option value="60">60 sec</option>
                      </select>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-gray-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <i className="ri-lightbulb-line text-blue-600 text-xl flex-shrink-0 mt-0.5"></i>
                      <div>
                        <h4 className="text-sm font-semibold text-blue-900 mb-1">💡 Auto-Tuner Recommendation</h4>
                        <p className="text-sm text-blue-800 mb-2">
                          After first execution, we'll automatically analyze and recommend optimal specs.
                        </p>
                        <div className="text-sm text-blue-700">
                          Estimated cost savings: <strong>up to 85%</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Environment Variables */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-3">
                      🔑 Environment Variables
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
                        Add Variable
                      </button>
                    </div>
                    <p className="mt-3 text-xs text-gray-500">Safely manage sensitive information like API Keys and DB URLs</p>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-8">
                  <button
                    onClick={() => navigate('/dashboard')}
                    className="px-6 py-3 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all whitespace-nowrap cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setCurrentStep(2)}
                    disabled={!formData.name}
                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next Step (Write Code)
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Code Editor */}
            {currentStep === 2 && (
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200 p-8 shadow-sm">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Write Code</h2>

                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-semibold text-gray-700">
                      Function Code
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
                        Upload File
                      </button>
                      <button
                        onClick={handleGithubConnect}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-all whitespace-nowrap cursor-pointer"
                      >
                        <i className="ri-github-line mr-1"></i>
                        GitHub Connect
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
                      <h4 className="text-sm font-semibold text-blue-900 mb-1">Function Writing Guide</h4>
                      <ul className="text-sm text-blue-800 space-y-1">
                        <li>• Handler function receives event and context as parameters</li>
                        <li>• Return value must include statusCode and body</li>
                        <li>• External libraries should be specified in requirements.txt</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between gap-3">
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="px-6 py-3 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all whitespace-nowrap cursor-pointer"
                  >
                    Previous Step
                  </button>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowTestModal(true)}
                      className="px-6 py-3 bg-white border-2 border-blue-400 text-blue-600 font-semibold rounded-xl hover:bg-blue-50 transition-all whitespace-nowrap cursor-pointer"
                    >
                      Test Run
                    </button>
                    <button
                      onClick={() => setCurrentStep(3)}
                      className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all whitespace-nowrap cursor-pointer"
                    >
                      Next Step
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Deploy Confirmation */}
            {currentStep === 3 && (
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200 p-8 shadow-sm">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Deploy Confirmation</h2>

                <div className="space-y-6 mb-8">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 border border-gray-200">
                      <div className="text-sm text-gray-600 mb-1">Function Name</div>
                      <div className="font-semibold text-gray-900">{formData.name}</div>
                    </div>
                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 border border-gray-200">
                      <div className="text-sm text-gray-600 mb-1">Handler</div>
                      <div className="font-semibold text-gray-900">{formData.handler}</div>
                    </div>
                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 border border-gray-200">
                      <div className="text-sm text-gray-600 mb-1">Language / Runtime</div>
                      <div className="font-semibold text-gray-900">
                        {languages.find(l => l.id === formData.language)?.name} {languages.find(l => l.id === formData.language)?.version}
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 border border-gray-200">
                      <div className="text-sm text-gray-600 mb-1">Warm Pool</div>
                      <div className="font-semibold text-gray-900">
                        {formData.warmPoolEnabled ? '✅ Enabled' : '❌ Disabled'}
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 border border-gray-200">
                      <div className="text-sm text-gray-600 mb-1">Memory</div>
                      <div className="font-semibold text-gray-900">{formData.memory} MB</div>
                    </div>
                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 border border-gray-200">
                      <div className="text-sm text-gray-600 mb-1">Timeout</div>
                      <div className="font-semibold text-gray-900">{formData.timeout} seconds</div>
                    </div>
                  </div>

                  {formData.envVars.length > 0 && (
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
                      <div className="text-sm font-semibold text-gray-700 mb-3">Environment Variables ({formData.envVars.length})</div>
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
                        <h4 className="text-sm font-semibold text-purple-900 mb-1">Auto-Tuner Recommendation</h4>
                        <p className="text-sm text-purple-800 mb-2">
                          After first execution, we'll automatically analyze and recommend optimal specs.
                        </p>
                        <div className="text-sm text-purple-700">
                          Estimated cost savings: <strong>up to 85%</strong>
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
                    Previous Step
                  </button>
                  <button
                    onClick={handleDeploy}
                    className="px-8 py-3 bg-gradient-to-r from-purple-400 to-pink-400 text-white font-semibold rounded-xl hover:shadow-lg transition-all whitespace-nowrap cursor-pointer flex items-center gap-2"
                  >
                    <i className="ri-rocket-line"></i>
                    Start Deploy
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
              <p className="text-gray-600">Deploying function...</p>
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
                            <span>Core Feature: Zero Cold Start</span>
                          </div>
                          <p className="text-xs text-orange-800 mt-1">
                            Communicating with Worker Nodes to pre-warm containers.
                          </p>
                        </div>
                      )}
                    </div>

                    {deploymentStep > index && (
                      <div className="flex-shrink-0">
                        <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-1 rounded-full">
                          Done
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
                    Protected by FaaS Warm Pool
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
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Connect GitHub Repository</h3>
              <p className="text-gray-600 text-sm">
                Import code from GitHub repository
              </p>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Repository URL
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
                  Branch
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
                  File Path
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
                  <h4 className="text-sm font-semibold text-blue-900 mb-1">Instructions</h4>
                  <ul className="text-xs text-blue-800 space-y-1">
                    <li>• Only public repositories can be connected</li>
                    <li>• Private repositories require a Personal Access Token</li>
                    <li>• File path is relative to repository root</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowGithubModal(false)}
                className="flex-1 px-6 py-3 bg-white border border-purple-200 text-gray-700 font-semibold rounded-xl hover:bg-purple-50 transition-all whitespace-nowrap cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleGithubImport}
                disabled={!githubUrl || !githubFilePath}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-400 to-pink-400 text-white font-semibold rounded-xl hover:shadow-lg transition-all whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <i className="ri-download-line"></i>
                Import Code
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

              <h3 className="text-2xl font-bold text-gray-900 mb-3">Deployment Failed</h3>
              <p className="text-gray-600 mb-6">
                An error occurred during deployment.
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
                      <div className="font-semibold text-red-900 text-sm mb-1">Error Message</div>
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
                    <h4 className="text-sm font-semibold text-blue-900 mb-2">Troubleshooting</h4>
                    <ul className="text-sm text-blue-800 space-y-1">
                      {failureInfo.step === 0 && (
                        <>
                          <li>• Check the code file size (max 50MB)</li>
                          <li>• Check your network connection</li>
                          <li>• Try again in a few moments</li>
                        </>
                      )}
                      {failureInfo.step === 1 && (
                        <>
                          <li>• Check if the function name is not duplicated</li>
                          <li>• Verify your configuration values</li>
                          <li>• Check your account permissions</li>
                        </>
                      )}
                      {failureInfo.step === 2 && (
                        <>
                          <li>• Checking Worker Node status</li>
                          <li>• Re-select the runtime environment</li>
                          <li>• Contact system administrator</li>
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
                  Retry
                </button>
                <button
                  onClick={handleCancelDeploy}
                  className="w-full px-6 py-3 bg-white border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all whitespace-nowrap cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              {/* Support Link */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="text-sm text-gray-600">
                  If the problem persists,{' '}
                  <a href="#" className="text-purple-600 font-semibold hover:underline">
                    contact support
                  </a>
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

              <h3 className="text-2xl font-bold text-gray-900 mb-3">Deployment Complete!</h3>
              <p className="text-gray-600 mb-4">
                Function has been deployed successfully.
              </p>

              <div className="bg-gradient-to-br from-orange-50 to-red-50 border-2 border-orange-300 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <i className="ri-flashlight-fill text-orange-600 text-xl"></i>
                  <span className="font-bold text-orange-900">Expected Cold Start Time</span>
                </div>
                <div className="text-4xl font-black text-orange-600">0ms</div>
                <p className="text-xs text-orange-800 mt-2">
                  Ready to run instantly thanks to Warm Pool
                </p>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 mb-6 border border-gray-200">
                <div className="text-sm text-gray-600 mb-2">Function Name</div>
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
                  ⚡ Run Test Now
                </button>
                <button
                  onClick={handleCloseModal}
                  className="w-full px-6 py-3 bg-white border border-purple-200 text-gray-700 font-semibold rounded-xl hover:bg-purple-50 transition-all whitespace-nowrap cursor-pointer"
                >
                  Go to Dashboard
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

              <h3 className="text-2xl font-bold text-gray-900 mb-3">🛠️ Build Failed</h3>
              <p className="text-gray-600 mb-6">
                Compilation errors were found in the code.
              </p>
            </div>

            {/* Error Details */}
            <div className="bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-300 rounded-xl p-5 mb-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <i className="ri-error-warning-line text-xl text-white"></i>
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-red-900 mb-1">Compilation Error</h4>
                  <p className="text-sm text-red-800">
                    A syntax error was found in the C++ code and the build was aborted.
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
                  <span className="text-gray-500 ml-2">Syntax error here</span>
                </div>
              </div>
            </div>

            {/* Troubleshooting Tips */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <i className="ri-lightbulb-line text-blue-600 text-xl flex-shrink-0 mt-0.5"></i>
                <div>
                  <h4 className="text-sm font-semibold text-blue-900 mb-2">Troubleshooting</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Go back to the code editor and check line {buildError.line}</li>
                    <li>• Check for missing semicolons(;), parentheses(), or braces{'{}'}</li>
                    <li>• Verify function declarations match their definitions</li>
                    <li>• Ensure all required header files (#include) are included</li>
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
                Go back to edit code
              </button>
              <button
                onClick={() => setShowBuildErrorModal(false)}
                className="w-full px-6 py-3 bg-white border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all whitespace-nowrap cursor-pointer"
              >
                Close
              </button>
            </div>

            {/* Support Link */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-sm text-gray-600 text-center">
                💡 FaaS automatically validates code before deployment to prevent runtime errors
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

              <h3 className="text-2xl font-bold text-gray-900 mb-3">⚠️ Deployment Complete (Warning)</h3>
              <p className="text-gray-600 mb-6">
                Function deployed but pre-warming failed.
              </p>

              {/* Warning Details */}
              <div className="bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-300 rounded-xl p-5 mb-6 text-left">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 bg-yellow-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <i className="ri-time-line text-xl text-white"></i>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-yellow-900 mb-1">Warm Pool Allocation Delayed</h4>
                    <p className="text-sm text-yellow-800">
                      Container pre-warming is delayed due to high traffic.
                    </p>
                  </div>
                </div>

                <div className="bg-white/80 rounded-lg p-4 border border-yellow-200">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-gray-700">Expected Cold Start Time</span>
                  </div>
                  <div className="text-3xl font-black text-orange-600">120~300ms</div>
                  <p className="text-xs text-gray-600 mt-2">
                    First run may have delay due to container initialization.
                  </p>
                </div>
              </div>

              {/* Info Box */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 mb-6 text-left">
                <div className="flex items-start gap-3">
                  <i className="ri-information-line text-blue-600 text-xl flex-shrink-0 mt-0.5"></i>
                  <div>
                    <h4 className="text-sm font-semibold text-blue-900 mb-2">Information</h4>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>• Function is working normally and registered in DynamoDB</li>
                      <li>• Will be added to Warm Pool automatically in a few minutes</li>
                      <li>• 0ms Cold Start guaranteed from the second run</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Function Info */}
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 mb-6 border border-gray-200">
                <div className="text-sm text-gray-600 mb-2">Deployed Function</div>
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
                  🐢 Run (Cold Start Expected)
                </button>
                <button
                  onClick={handleCloseWarning}
                  className="w-full px-6 py-3 bg-white border border-purple-200 text-gray-700 font-semibold rounded-xl hover:bg-purple-50 transition-all whitespace-nowrap cursor-pointer"
                >
                  Go to Dashboard
                </button>
              </div>

              {/* Note */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="text-sm text-gray-600">
                  💡 FaaS Warm Pool learns usage patterns and optimizes automatically
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
                  <h3 className="text-xl font-bold text-white">Function Test</h3>
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
                  Input Data
                </button>
                <button
                  onClick={() => setActiveTestTab('result')}
                  className={`px-4 py-3 font-semibold text-sm transition-all cursor-pointer ${activeTestTab === 'result'
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  <i className="ri-terminal-line mr-2"></i>
                  Execution Result
                </button>
                <button
                  onClick={() => setActiveTestTab('analysis')}
                  className={`px-4 py-3 font-semibold text-sm transition-all cursor-pointer ${activeTestTab === 'analysis'
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  <i className="ri-bar-chart-line mr-2"></i>
                  Advanced Analysis
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Input Tab */}
              {activeTestTab === 'input' && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-semibold text-gray-700">
                      Test Input Data (JSON)
                    </label>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium ${isAsyncMode ? 'text-purple-600' : 'text-gray-500'}`}>
                        <i className="ri-timer-flash-line mr-1"></i>
                        Async Execution
                      </span>
                      <button
                        onClick={() => setIsAsyncMode(!isAsyncMode)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 cursor-pointer ${isAsyncMode ? 'bg-purple-600' : 'bg-gray-200'
                          }`}
                      >
                        <span
                          className={`${isAsyncMode ? 'translate-x-6' : 'translate-x-1'
                            } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                        />
                      </button>
                    </div>
                  </div>
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
                        <h4 className="text-sm font-semibold text-blue-900 mb-1">Input Format Guide</h4>
                        <p className="text-sm text-blue-800">
                          Enter test data in JSON format. It will be passed as the event parameter to the function.
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
                      <p className="text-gray-600 font-medium">Executing function...</p>
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
                              {testResult.success ? '✅ Execution Successful' : '❌ Execution Failed'}
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
                          <div className="text-sm text-gray-600 mb-1">Response Time</div>
                          <div className="text-2xl font-bold text-blue-600">{testResult.responseTime}ms</div>
                        </div>
                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
                          <div className="text-sm text-gray-600 mb-1">Memory Used</div>
                          <div className="text-2xl font-bold text-blue-600">{testResult.memoryUsed}MB</div>
                        </div>
                      </div>

                      {/* Output */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Output Result
                        </label>
                        <div className="bg-gray-900 rounded-xl p-4 font-mono text-sm text-gray-100 overflow-x-auto">
                          <pre>{testResult.output}</pre>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                      <i className="ri-play-circle-line text-6xl mb-4"></i>
                      <p>Click the button below to run a test</p>
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
                          <h3 className="text-2xl font-bold">Auto-Tuner Analysis</h3>
                        </div>
                        <p className="text-white/90">
                          Analyzing optimal settings based on execution data
                        </p>
                      </div>

                      {/* Resource Usage */}
                      <div>
                        <h4 className="text-lg font-bold text-gray-900 mb-4">Resource Usage Pattern</h4>
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
                          Optimization Recommendation
                        </h4>
                        <div className="space-y-4">
                          <div className="flex items-start gap-3 bg-green-50 p-4 rounded-lg border border-green-200">
                            <i className="ri-lightbulb-flash-line text-green-600 text-xl flex-shrink-0 mt-0.5"></i>
                            <div>
                              <div className="font-semibold text-gray-900 mb-1">Memory Optimization</div>
                              <p className="text-sm text-gray-600">
                                Currently using {testResult.memoryUsed}MB. 256MB should be sufficient.
                              </p>
                              <p className="text-sm font-semibold text-green-600 mt-1">
                                Expected cost savings: 50%
                              </p>
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-4 border border-gray-200">
                            <div className="flex items-start gap-3">
                              <i className="ri-time-line text-blue-600 text-xl flex-shrink-0 mt-0.5"></i>
                              <div>
                                <div className="font-semibold text-gray-900 mb-1">Timeout Adjustment</div>
                                <p className="text-sm text-gray-600">
                                  Average response time is {testResult.responseTime}ms. You can reduce timeout to 10 seconds.
                                </p>
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
                            <h4 className="text-sm font-semibold text-blue-900 mb-2">Insights</h4>
                            <ul className="text-sm text-blue-800 space-y-1">
                              <li>• Function is running efficiently</li>
                              <li>• Cold Start has been eliminated with Warm Pool activation</li>
                              <li>• Additional optimization can save up to 85% in costs</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                      <i className="ri-bar-chart-line text-6xl mb-4"></i>
                      <p>Please run a test first</p>
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
                  Close
                </button>
                <button
                  onClick={handleTestRun}
                  disabled={testRunning}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <i className="ri-play-line"></i>
                  {testRunning ? 'Running...' : 'Run Test'}
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
