import { useAlertStore } from '../../store/alertStore';

export default function ToastContainer() {
    const { toasts, removeToast } = useAlertStore();

    const getIcon = (type: string) => {
        switch (type) {
            case 'success': return 'ri-check-line';
            case 'error': return 'ri-error-warning-line';
            case 'warning': return 'ri-alert-line';
            default: return 'ri-information-line';
        }
    };

    const getColor = (type: string) => {
        switch (type) {
            case 'success': return 'bg-green-500';
            case 'error': return 'bg-red-500';
            case 'warning': return 'bg-amber-500';
            default: return 'bg-blue-500';
        }
    };

    const getBorderColor = (type: string) => {
        switch (type) {
            case 'success': return 'border-green-200';
            case 'error': return 'border-red-200';
            case 'warning': return 'border-amber-200';
            default: return 'border-blue-200';
        }
    };

    if (toasts.length === 0) return null;

    return (
        <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-3 max-w-sm">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={`bg-white rounded-xl shadow-2xl border ${getBorderColor(toast.type)} p-4 animate-slideIn flex items-start gap-3`}
                    style={{
                        animation: 'slideIn 0.3s ease-out',
                    }}
                >
                    <div className={`w-8 h-8 rounded-lg ${getColor(toast.type)} flex items-center justify-center flex-shrink-0`}>
                        <i className={`${getIcon(toast.type)} text-white`}></i>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900 text-sm">{toast.title}</h4>
                        <p className="text-gray-600 text-xs mt-0.5 truncate">{toast.message}</p>
                    </div>
                    <button
                        onClick={() => removeToast(toast.id)}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <i className="ri-close-line"></i>
                    </button>
                </div>
            ))}

            <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slideIn {
          animation: slideIn 0.3s ease-out;
        }
      `}</style>
        </div>
    );
}
