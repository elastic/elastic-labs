import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';

const PicsGrid = lazy(() => import('./PicsGrid.jsx'));
const PicDetail = lazy(() => import('./PicDetail.jsx'));

export default function PicsRoutes() {
  return (
    <Routes>
      <Route index element={<PicsGrid />} />
      <Route path=":picId" element={<PicDetail />} />
    </Routes>
  );
}
