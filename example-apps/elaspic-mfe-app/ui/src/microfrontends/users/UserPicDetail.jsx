import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EuiButtonEmpty, EuiFlexGroup, EuiFlexItem, EuiImage, EuiSpacer, EuiTitle } from '@elastic/eui';
import { api } from '../../api/client.js';
import { CommentPanel } from '../../components/CommentPanel.jsx';

export default function UserPicDetail() {
  const { userId, picId } = useParams();
  const navigate = useNavigate();
  const [pic, setPic] = useState(null);

  useEffect(() => {
    api
      .userPic(userId, picId)
      .then(({ data }) => setPic(data))
      .catch(() => navigate(`/users/${userId}`));
  }, [userId, picId, navigate]);

  if (!pic) return null;

  return (
    <>
      <EuiButtonEmpty iconType="arrowLeft" onClick={() => navigate(`/users/${userId}`)}>
        Back to gallery
      </EuiButtonEmpty>
      <EuiSpacer />
      <EuiFlexGroup>
        <EuiFlexItem grow={2}>
          <EuiImage alt="Picture" src={pic.base64} hasShadow allowFullScreen />
        </EuiFlexItem>
        <EuiFlexItem grow={1}>
          <EuiTitle size="s">
            <h2>By {pic.author}</h2>
          </EuiTitle>
          <EuiSpacer />
          <CommentPanel
            loadComments={() => api.userComments(userId, picId)}
            postComment={(text) => api.postUserComment(userId, picId, text)}
            putComment={(id, text) => api.putUserComment(userId, picId, id, text)}
            deleteComment={(id) => api.deleteUserComment(userId, picId, id)}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
}
