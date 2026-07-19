import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** 自定义错误回退渲染 */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * 通用错误边界组件
 *
 * 用途：包裹容易 throw 的组件区域（如算料工作区），避免单个组件 throw 导致整页白屏。
 * throw 时显示错误信息 + 重试按钮，方便用户截图反馈给开发者定位。
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] caught:', error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return <>{this.props.fallback(this.state.error, this.reset)}</>;
      }
      return (
        <div className="m-8 p-6 bg-red-50 border border-red-200 rounded-2xl">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
              <span className="text-red-600 font-black">!</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-black text-red-700 mb-1">页面渲染出错</h3>
              <p className="text-xs text-red-500 mb-3 break-all">
                {this.state.error.message || String(this.state.error)}
              </p>
              <pre className="text-[10px] text-red-400 bg-white p-3 rounded-lg overflow-auto max-h-40 mb-3">
                {this.state.error.stack || '(无堆栈)'}
              </pre>
              <button
                onClick={this.reset}
                className="px-4 py-2 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                重试
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
