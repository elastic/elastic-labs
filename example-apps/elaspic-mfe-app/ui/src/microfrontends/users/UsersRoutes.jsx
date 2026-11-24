import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';

const UsersList = lazy(() => import('./UsersList.jsx'));
const UserGallery = lazy(() => import('./UserGallery.jsx'));
const UserPicDetail = lazy(() => import('./UserPicDetail.jsx'));

export default function UsersRoutes() {
  return (
    <Routes>
      <Route index element={<UsersList />} />
      <Route path=":userId" element={<UserGallery />} />
      <Route path=":userId/pics/:picId" element={<UserPicDetail />} />
    </Routes>
  );
}
