import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  EuiButton,
  EuiCard,
  EuiFlexGrid,
  EuiFlexItem,
  EuiPageHeader,
  EuiText,
} from '@elastic/eui';
import { api } from '../../api/client.js';
import { ErrorBanner } from '../../components/ErrorBanner.jsx';
import { ValidationErrorSummary } from '../../components/ValidationErrorSummary.jsx';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

export default function PicsGrid() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [pics, setPics] = useState([]);
  const [error, setError] = useState(null);
  const [uploadErrors, setUploadErrors] = useState([]);
  const [uploadApiError, setUploadApiError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    const { data } = await api.pics();
    setPics(data);
  }, []);

  useEffect(() => {
    load().catch(() => setError('We could not load your gallery.'));
  }, [load]);

  const onAddClick = () => fileRef.current?.click();

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadErrors([]);
    setUploadApiError(null);
    const clientErrors = [];
    if (!ALLOWED.includes(file.type)) {
      clientErrors.push({ field: 'image', message: 'Use a JPEG, PNG, or WebP image.' });
    }
    if (file.size > MAX_BYTES) {
      clientErrors.push({ field: 'image', message: 'The image must be 5 MB or smaller.' });
    }
    if (clientErrors.length) {
      setUploadErrors(clientErrors);
      return;
    }
    try {
      await api.uploadPic(file);
      await load();
    } catch (err) {
      const msg =
        err.data?.errors?.[0]?.message || err.data?.message || 'We could not upload your image.';
      setUploadApiError(msg);
    }
  };

  return (
    <>
      <EuiPageHeader
        pageTitle="My pictures"
        rightSideItems={[
          <EuiButton key="add" fill iconType="plusInCircle" onClick={onAddClick}>
            Add picture
          </EuiButton>,
        ]}
      />
      <EuiText size="s" color="subdued">
        JPEG, PNG, or WebP · 5 MB max
      </EuiText>
      <input ref={fileRef} type="file" accept={ALLOWED.join(',')} hidden onChange={onFile} />
      <ValidationErrorSummary errors={uploadErrors} fieldLabels={{ image: 'Image' }} />
      {uploadApiError && (
        <ErrorBanner title={uploadApiError}>
          <p>Choose another file or try again in a moment.</p>
        </ErrorBanner>
      )}
      {error && (
        <ErrorBanner title={error} onRetry={() => load().catch(() => setError('We could not load your gallery.'))}>
          <p>There may be a temporary connection issue.</p>
        </ErrorBanner>
      )}
      <EuiFlexGrid columns={3} gutterSize="m">
        {pics.map((p) => (
          <EuiFlexItem key={p.id}>
            <EuiCard
              textAlign="left"
              title={p.author}
              onClick={() => navigate(`/pics/${p.id}`)}
              image={<img src={p.thumbnailBase64} alt="" style={{ width: '100%', objectFit: 'cover' }} />}
            />
          </EuiFlexItem>
        ))}
      </EuiFlexGrid>
    </>
  );
}
