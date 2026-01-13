interface SkeletonLoaderProps {
  type?: 'card' | 'table' | 'text' | 'stat';
  count?: number;
  className?: string;
}

export default function SkeletonLoader({ type = 'card', count = 1, className = '' }: SkeletonLoaderProps) {
  const renderSkeleton = () => {
    switch (type) {
      case 'stat':
        return (
          <div className="bg-white/80 backdrop-blur-sm border border-purple-100 rounded-xl p-6">
            <div className="h-4 bg-purple-100 rounded w-24 mb-3 animate-pulse"></div>
            <div className="h-8 bg-purple-100 rounded w-32 animate-pulse"></div>
          </div>
        );
      
      case 'table':
        return (
          <div className="bg-white/80 backdrop-blur-sm border border-purple-100 rounded-xl overflow-hidden">
            <div className="h-12 bg-purple-50 border-b border-purple-100 animate-pulse"></div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 border-b border-purple-100 px-6 flex items-center gap-4">
                <div className="h-4 bg-purple-100 rounded flex-1 animate-pulse"></div>
                <div className="h-4 bg-purple-100 rounded w-24 animate-pulse"></div>
                <div className="h-4 bg-purple-100 rounded w-32 animate-pulse"></div>
              </div>
            ))}
          </div>
        );
      
      case 'text':
        return (
          <div className="space-y-2">
            <div className="h-4 bg-purple-100 rounded w-full animate-pulse"></div>
            <div className="h-4 bg-purple-100 rounded w-5/6 animate-pulse"></div>
            <div className="h-4 bg-purple-100 rounded w-4/6 animate-pulse"></div>
          </div>
        );
      
      default:
        return (
          <div className="bg-white/80 backdrop-blur-sm border border-purple-100 rounded-xl p-6">
            <div className="h-6 bg-purple-100 rounded w-3/4 mb-4 animate-pulse"></div>
            <div className="space-y-2">
              <div className="h-4 bg-purple-100 rounded w-full animate-pulse"></div>
              <div className="h-4 bg-purple-100 rounded w-5/6 animate-pulse"></div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>{renderSkeleton()}</div>
      ))}
    </div>
  );
}
