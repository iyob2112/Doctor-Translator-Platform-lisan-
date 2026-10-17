import { useNavigate } from "react-router-dom";

export default function JoinLiveButton({ sessionId, status }) {
  const navigate = useNavigate();
  if (status !== "active") return null;
  return (
    <button
      type="button"
      className="btn-dark min-h-10 w-full px-4 py-2 text-sm sm:w-auto sm:min-h-0 sm:px-3 sm:py-1.5 sm:text-xs"
      onClick={() => navigate(`/call/${sessionId}`)}
    >
      Join live
    </button>
  );
}
