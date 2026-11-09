import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {SiteContentProvider} from './site-content';
import './styles.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><SiteContentProvider><App/></SiteContentProvider></React.StrictMode>);
