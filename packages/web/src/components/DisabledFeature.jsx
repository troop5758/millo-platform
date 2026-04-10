/**
 * Block surface for features that are off in this deployment (honest unavailable state).
 * https://milloapp.com
 */
export function DisabledFeature({ label }) {
  return (
    <div className="p-4 bg-gray-800 text-center">
      {label}
    </div>
  );
}
