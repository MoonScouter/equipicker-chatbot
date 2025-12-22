import React from "react";

const LoadingMessage: React.FC = () => {
  return (
    <div className="text-sm">
      <div className="flex flex-col">
        <div className="flex">
          <div className="mr-4 flex items-center gap-2 rounded-[16px] px-4 py-2 md:mr-24 text-slate-700 bg-white font-light">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-100 text-sky-700">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="4" y="7" width="16" height="12" rx="3" />
                <path d="M12 4v3" />
                <circle cx="9" cy="13" r="1" />
                <circle cx="15" cy="13" r="1" />
                <path d="M8 16h8" />
              </svg>
            </span>
            <span className="text-xs uppercase tracking-wide text-slate-500">
              Thinking
            </span>
            <span className="flex items-center gap-1">
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400"
                style={{ animationDelay: "0ms" }}
              />
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400"
                style={{ animationDelay: "150ms" }}
              />
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400"
                style={{ animationDelay: "300ms" }}
              />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadingMessage;
