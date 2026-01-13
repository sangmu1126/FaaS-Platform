interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export default function ErrorMessage({ message, onRetry, className = '' }: ErrorMessageProps) {
  return (
    <div className={`bg-red-50/80 backdrop-blur-sm border border-red-200 rounded-xl p-6 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
          <i className="ri-error-warning-line text-xl text-red-600"></i>
        </div>
        <div className="flex-1">
          <h3 className="text-red-900 font-semibold mb-1">Error</h3>
          <p className="text-red-700 text-sm">{message}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap cursor-pointer"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
