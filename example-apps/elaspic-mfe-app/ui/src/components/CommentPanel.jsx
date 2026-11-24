import { useEffect, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiCommentList,
  EuiFieldText,
  EuiForm,
  EuiFormRow,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { useAuth } from '../auth/AuthContext.jsx';
import { ErrorBanner } from './ErrorBanner.jsx';

export function CommentPanel({
  loadComments,
  postComment,
  putComment,
  deleteComment,
}) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState(null);
  const [retryLoad, setRetryLoad] = useState(null);

  const refresh = async () => {
    const { data } = await loadComments();
    setComments(data);
    setError(null);
    setRetryLoad(null);
  };

  useEffect(() => {
    refresh().catch(() => {
      setError('We could not load comments.');
      setRetryLoad(() => () => refresh().catch(() => setError('We could not load comments.')));
    });
  }, []);

  const onAdd = async () => {
    setError(null);
    setRetryLoad(null);
    try {
      await postComment(text);
      setText('');
      await refresh();
    } catch (e) {
      setError(e.data?.message || 'We could not post your comment.');
    }
  };

  const onSaveEdit = async () => {
    setError(null);
    setRetryLoad(null);
    try {
      await putComment(editingId, editText);
      setEditingId(null);
      await refresh();
    } catch (e) {
      setError(e.data?.message || 'We could not save your comment.');
    }
  };

  const list = comments.map((c) => ({
    username: c.author,
    timelineAvatar: c.author.slice(0, 1).toUpperCase(),
    event: (
      <>
        <EuiText size="s">{c.comment}</EuiText>
        {c.author === user?.username && editingId !== c.id && (
          <>
            <EuiSpacer size="s" />
            <EuiButtonEmpty size="xs" onClick={() => { setEditingId(c.id); setEditText(c.comment); }}>
              Edit
            </EuiButtonEmpty>
            <EuiButtonEmpty size="xs" color="danger" onClick={() => deleteComment(c.id).then(refresh)}>
              Delete
            </EuiButtonEmpty>
          </>
        )}
        {editingId === c.id && (
          <>
            <EuiSpacer size="s" />
            <EuiFieldText value={editText} onChange={(e) => setEditText(e.target.value)} fullWidth />
            <EuiSpacer size="s" />
            <EuiButton fill onClick={onSaveEdit}>
              Save comment
            </EuiButton>{' '}
            <EuiButtonEmpty onClick={() => setEditingId(null)}>Cancel</EuiButtonEmpty>
          </>
        )}
      </>
    ),
  }));

  return (
    <>
      <EuiText>
        <h3>Comments</h3>
      </EuiText>
      <EuiSpacer />
      {error && (
        <ErrorBanner title={error} onRetry={retryLoad ?? undefined}>
          <p>{retryLoad ? 'There may be a temporary connection issue.' : 'Your text is still here — try again when you are ready.'}</p>
        </ErrorBanner>
      )}
      <EuiCommentList comments={list} />
      <EuiSpacer size="l" />
      <EuiForm>
        <EuiFormRow label="Add comment" fullWidth>
          <EuiFieldText value={text} onChange={(e) => setText(e.target.value)} fullWidth />
        </EuiFormRow>
        <EuiSpacer />
        <EuiButton onClick={onAdd} fill>
          Post comment
        </EuiButton>
      </EuiForm>
    </>
  );
}
