'use client';

import { useSchedules, useToggleSchedule, useDeleteSchedule } from '@/hooks/use-schedules';
import { TerminalCard } from '@/components/ui/terminal-card';
import { NeonButton } from '@/components/ui/neon-button';

export function ScheduleList() {
  const { data: schedules, isLoading } = useSchedules();
  const toggleSchedule = useToggleSchedule();
  const deleteSchedule = useDeleteSchedule();

  if (isLoading) return null;

  return (
    <div className="space-y-4">
      {schedules?.map(schedule => (
        <TerminalCard key={schedule.id} title={schedule.recipientName || 'Unnamed Schedule'}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1 flex-1">
              {schedule.recipientXpub ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neon-green font-mono">⇄ xpub</span>
                  <span className="text-xs text-cyber-muted font-mono">
                    {schedule.recipientXpub.slice(0, 16)}... · address #{schedule.recipientXpubIndex}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-cyber-muted font-mono truncate">{schedule.recipientAddress}</p>
              )}
              <div className="flex items-center gap-4 text-sm">
                <span className="text-neon-amber font-mono font-bold">
                  {BigInt(schedule.amountSats).toLocaleString()} sats
                </span>
                <span className="text-cyber-muted">{schedule.cronExpression}</span>
              </div>
              <span className={schedule.isActive ? 'text-neon-green text-xs' : 'text-neon-red text-xs'}>
                {schedule.isActive ? '● Active' : '○ Paused'}
              </span>
            </div>
            <div className="flex gap-2">
              <NeonButton
                variant={schedule.isActive ? 'amber' : 'green'}
                size="sm"
                onClick={() => toggleSchedule.mutate({ scheduleId: schedule.id, isActive: !schedule.isActive })}
              >
                {schedule.isActive ? 'Pause' : 'Resume'}
              </NeonButton>
              <NeonButton
                variant="red"
                size="sm"
                onClick={() => { if (confirm('Delete this schedule?')) deleteSchedule.mutate(schedule.id); }}
              >
                Delete
              </NeonButton>
            </div>
          </div>
        </TerminalCard>
      ))}
    </div>
  );
}
