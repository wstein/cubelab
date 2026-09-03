/** Register the offline app shell only for production builds. */
export const registerPwa = (): void => {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  window.addEventListener(
    "load",
    () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error: unknown) => {
        console.warn("CubeLab offline cache could not be registered.", error);
      });
    },
    { once: true },
  );
};
