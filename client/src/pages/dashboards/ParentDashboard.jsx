// Shell is applied by the layout route in App.jsx, not imported here — every
// page under a role's route tree renders inside it automatically.
export default function ParentDashboard() {
  return (
    <p className="text-sm text-slate-500">
      No modules built yet. Sidebar items appear in full colour as their pages land.
    </p>
  );
}
