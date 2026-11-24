import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  EuiButtonEmpty,
  EuiCard,
  EuiFlexGrid,
  EuiFlexItem,
  EuiPageHeader,
  EuiSpacer,
} from '@elastic/eui';
import { api } from '../../api/client.js';

export default function UserGallery() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [pics, setPics] = useState([]);

  const load = useCallback(async () => {
    try {
      const { data } = await api.userPics(userId);
      setPics(data);
    } catch (e) {
      if (e.status === 404) navigate('/users');
    }
  }, [userId, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <EuiButtonEmpty iconType="arrowLeft" onClick={() => navigate('/users')}>
        Back to users
      </EuiButtonEmpty>
      <EuiSpacer />
      <EuiPageHeader pageTitle="User gallery" />
      <EuiSpacer />
      <EuiFlexGrid columns={3} gutterSize="m">
        {pics.map((p) => (
          <EuiFlexItem key={p.id}>
            <EuiCard
              title={p.author}
              onClick={() => navigate(`/users/${userId}/pics/${p.id}`)}
              image={<img src={p.thumbnailBase64} alt="" style={{ width: '100%', objectFit: 'cover' }} />}
            />
          </EuiFlexItem>
        ))}
      </EuiFlexGrid>
    </>
  );
}
