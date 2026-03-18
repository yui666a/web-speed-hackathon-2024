import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';

import { ClientApp } from '@wsh-2024/app/src/index';

import { registerServiceWorker } from './utils/registerServiceWorker';

function getInjectData(): Record<string, unknown> {
  try {
    const el = document.getElementById('inject-data');
    if (el?.textContent) {
      return JSON.parse(el.textContent);
    }
  } catch {
    // ignore parse errors
  }
  return {};
}

const main = async () => {
  registerServiceWorker();

  const root = document.getElementById('root')!;

  if (window.location.pathname.startsWith('/admin')) {
    const { AdminApp } = await import('@wsh-2024/admin/src/index');
    ReactDOM.createRoot(root).render(<AdminApp />);
  } else {
    const fallback = getInjectData();
    ReactDOM.hydrateRoot(
      root,
      <SWRConfig value={{ fallback, revalidateIfStale: false, revalidateOnFocus: false, revalidateOnReconnect: false }}>
        <BrowserRouter>
          <ClientApp />
        </BrowserRouter>
      </SWRConfig>,
    );
  }
};

main().catch(console.error);
