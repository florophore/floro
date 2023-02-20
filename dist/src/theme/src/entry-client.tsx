import ReactDOM from 'react-dom/client'
import App from './App';

const ClientApp = (
    <App/>
);

ReactDOM.createRoot(document.getElementById('app') as HTMLElement).render(ClientApp);