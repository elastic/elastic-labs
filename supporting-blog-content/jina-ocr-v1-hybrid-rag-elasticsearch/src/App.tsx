import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SearchModeProvider } from './contexts/SearchModeContext';
import DocChat from './components/DocChat';
import Header from './components/Header';
import CategoryPage from './pages/CategoryPage';
import DocumentsPage from './pages/DocumentsPage';
import Home from './pages/Home';
import ProductDetail from './pages/ProductDetail';
import SearchResults from './pages/SearchResults';
import './App.css';

export default function App() {
  return (
    <SearchModeProvider>
    <BrowserRouter>
      <Header />
      <main className="page-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<SearchResults />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/category/:category" element={<CategoryPage />} />
          <Route path="/product/:id" element={<ProductDetail />} />
        </Routes>
      </main>
      <DocChat />
    </BrowserRouter>
    </SearchModeProvider>
  );
}
