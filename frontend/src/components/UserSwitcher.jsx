import React from 'react';
import { SEED_USERS } from '../mocks/mockServer';
import { Users } from 'lucide-react';

/**
 * UserSwitcher Component
 * Allows picking which seeded identity this chat pane acts as.
 *
 * @param {Object} props
 * @param {number} props.currentUserId - Currently active user ID
 * @param {(userId: number) => void} props.onSelectUser - Selection callback
 */
export function UserSwitcher({ currentUserId, onSelectUser }) {
  return (
    <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-lg border border-slate-700/60 shadow-inner">
      <Users className="w-3.5 h-3.5 text-slate-400 ml-1 flex-shrink-0" />
      <span className="text-[11px] font-medium text-slate-400 mr-0.5 select-none hidden sm:inline">
        Act as:
      </span>
      <div className="flex items-center gap-1">
        {SEED_USERS.map((user) => {
          const isSelected = Number(user.id) === Number(currentUserId);
          return (
            <button
              key={user.id}
              onClick={() => onSelectUser(user.id)}
              type="button"
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/50'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
              title={`${user.name} (${user.role})`}
            >
              <span>{user.avatar}</span>
              <span>{user.name}</span>
              {user.is_new && (
                <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1 rounded uppercase font-mono">
                  New
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default UserSwitcher;
