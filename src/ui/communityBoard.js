export function createCommunityBoardController({ state, refs, boardConfig, storageKey, render }) {
  const categories = boardConfig.categories || [];
  const pageSize = boardConfig.pageSize || 10;
  const limits = {
    nickname: boardConfig.limits?.nickname || 12,
    title: boardConfig.limits?.title || 40,
    content: boardConfig.limits?.content || 1000,
    comment: boardConfig.limits?.comment || 500,
  };

  function backendEnabled() {
    return Boolean(boardConfig.enabled && boardConfig.url && boardConfig.anonKey && boardConfig.table);
  }

  function endpoint(query = "") {
    return `${boardConfig.url.replace(/\/$/, "")}/rest/v1/${boardConfig.table}${query}`;
  }

  function tableEndpoint(table, query = "") {
    return `${boardConfig.url.replace(/\/$/, "")}/rest/v1/${table}${query}`;
  }

  function headers(extra = {}) {
    return {
      apikey: boardConfig.anonKey,
      Authorization: `Bearer ${boardConfig.anonKey}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  function categoryLabel(id) {
    return categories.find((category) => category.id === id)?.label || id;
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    })[char]);
  }

  function formatDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function normalizePost(row) {
    return {
      id: row.id || crypto.randomUUID(),
      category: row.category || categories[0]?.id || "free",
      title: row.title || "제목 없음",
      nickname: row.nickname || "익명",
      content: row.content || "",
      createdAt: row.createdAt || row.created_at || new Date().toISOString(),
      commentCount: Number(row.commentCount ?? row.comment_count ?? 0) || 0,
    };
  }

  function normalizeComment(row) {
    return {
      id: row.id || crypto.randomUUID(),
      postId: row.postId || row.post_id,
      nickname: row.nickname || "익명",
      content: row.content || "",
      createdAt: row.createdAt || row.created_at || new Date().toISOString(),
    };
  }

  function localPosts() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "[]").map(normalizePost);
    } catch {
      return [];
    }
  }

  function saveLocalPosts(posts) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(posts));
    } catch {
      // localStorage can be unavailable in embedded browsers.
    }
  }

  function localComments() {
    try {
      return JSON.parse(localStorage.getItem(`${storageKey}-comments`) || "[]").map(normalizeComment);
    } catch {
      return [];
    }
  }

  function saveLocalComments(comments) {
    try {
      localStorage.setItem(`${storageKey}-comments`, JSON.stringify(comments));
    } catch {
      // localStorage can be unavailable in embedded browsers.
    }
  }

  function visibleLocalPosts() {
    return localPosts()
      .filter((post) => post.category === state.communityBoardTab)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function attachCommentCounts(posts, counts) {
    return posts.map((post) => ({
      ...post,
      commentCount: counts[post.id] || 0,
    }));
  }

  function localCommentCounts(postIds) {
    const ids = new Set(postIds);
    return localComments().reduce((counts, comment) => {
      if (ids.has(comment.postId)) counts[comment.postId] = (counts[comment.postId] || 0) + 1;
      return counts;
    }, {});
  }

  async function loadCommentCounts(posts) {
    if (!posts.length) return posts;
    const postIds = posts.map((post) => post.id);
    if (!backendEnabled() || !boardConfig.commentsTable) return attachCommentCounts(posts, localCommentCounts(postIds));
    try {
      const ids = postIds.map((id) => encodeURIComponent(id)).join(",");
      const query = `?select=post_id&post_id=in.(${ids})&hidden=eq.false&limit=1000`;
      const response = await fetch(tableEndpoint(boardConfig.commentsTable, query), {
        headers: headers(),
      });
      if (!response.ok) throw new Error(`댓글 수 조회 실패 (${response.status})`);
      const comments = await response.json();
      const counts = comments.reduce((map, row) => {
        const postId = row.post_id || row.postId;
        if (postId) map[postId] = (map[postId] || 0) + 1;
        return map;
      }, {});
      return attachCommentCounts(posts, counts);
    } catch (error) {
      console.warn(error);
      return attachCommentCounts(posts, localCommentCounts(postIds));
    }
  }

  async function loadPosts(force = false) {
    if (!state.communityBoardOpen) return;
    if (state.communityBoardLoading || (state.communityBoardLoaded && !force)) return;
    state.communityBoardLoading = true;
    state.communityBoardError = "";
    render();

    try {
      if (!backendEnabled()) throw new Error("게시판 서버 설정이 없습니다.");
      const offset = (state.communityBoardPage - 1) * pageSize;
      const query = `?select=id,category,title,nickname,created_at&category=eq.${encodeURIComponent(state.communityBoardTab)}&hidden=eq.false&order=created_at.desc&limit=${pageSize}&offset=${offset}`;
      const response = await fetch(endpoint(query), {
        headers: headers({ Prefer: "count=exact" }),
      });
      if (!response.ok) throw new Error(`게시글 조회 실패 (${response.status})`);
      const rows = await response.json();
      const range = response.headers.get("content-range") || "";
      const total = Number(range.split("/").at(-1)) || rows.length;
      state.communityBoardPosts = await loadCommentCounts(rows.map(normalizePost));
      state.communityBoardTotal = total;
    } catch (error) {
      const posts = visibleLocalPosts();
      const offset = (state.communityBoardPage - 1) * pageSize;
      state.communityBoardPosts = await loadCommentCounts(posts.slice(offset, offset + pageSize));
      state.communityBoardTotal = posts.length;
      state.communityBoardError = backendEnabled()
        ? "게시판 서버를 불러오지 못해 이 브라우저의 임시 글을 표시합니다."
        : "게시판 서버 설정 전이라 이 브라우저에 임시 저장됩니다.";
      console.warn(error);
    } finally {
      state.communityBoardLoaded = true;
      state.communityBoardLoading = false;
      render();
    }
  }

  async function loadPost(id) {
    state.communityBoardLoading = true;
    state.communityBoardError = "";
    render();

    try {
      if (!backendEnabled()) {
        const post = localPosts().find((item) => item.id === id);
        if (!post) throw new Error("게시글을 찾을 수 없습니다.");
        state.communityBoardPost = post;
        await loadComments(id);
        return;
      }
      const query = `?select=id,category,title,nickname,content,created_at&id=eq.${encodeURIComponent(id)}&hidden=eq.false&limit=1`;
      const response = await fetch(endpoint(query), { headers: headers() });
      if (!response.ok) throw new Error(`게시글 조회 실패 (${response.status})`);
      const rows = await response.json();
      state.communityBoardPost = rows[0] ? normalizePost(rows[0]) : null;
      if (!state.communityBoardPost) throw new Error("게시글을 찾을 수 없습니다.");
      await loadComments(id);
    } catch (error) {
      state.communityBoardError = "게시글을 불러오지 못했습니다.";
      state.communityBoardPost = null;
      console.warn(error);
    } finally {
      state.communityBoardMode = "detail";
      state.communityBoardLoading = false;
      render();
    }
  }

  async function loadComments(postId) {
    state.communityBoardCommentsLoading = true;
    state.communityBoardCommentError = "";
    render();

    try {
      if (!backendEnabled() || !boardConfig.commentsTable) throw new Error("댓글 서버 설정이 없습니다.");
      const query = `?select=id,post_id,nickname,content,created_at&post_id=eq.${encodeURIComponent(postId)}&hidden=eq.false&order=created_at.asc&limit=100`;
      const response = await fetch(tableEndpoint(boardConfig.commentsTable, query), {
        headers: headers(),
      });
      if (!response.ok) throw new Error(`댓글 조회 실패 (${response.status})`);
      const rows = await response.json();
      state.communityBoardComments = rows.map(normalizeComment);
    } catch (error) {
      state.communityBoardComments = localComments()
        .filter((comment) => comment.postId === postId)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      state.communityBoardCommentError = backendEnabled()
        ? "댓글 서버를 불러오지 못해 이 브라우저의 임시 댓글을 표시합니다."
        : "댓글 서버 설정 전이라 이 브라우저에 임시 저장됩니다.";
      console.warn(error);
    } finally {
      state.communityBoardCommentsLoading = false;
      render();
    }
  }

  async function submitPost(form) {
    const formData = new FormData(form);
    const category = formData.get("category") || state.communityBoardTab;
    const nickname = String(formData.get("nickname") || "익명").trim().slice(0, limits.nickname) || "익명";
    const title = String(formData.get("title") || "").trim().slice(0, limits.title);
    const content = String(formData.get("content") || "").trim().slice(0, limits.content);

    if (title.length < 2) {
      state.communityBoardError = "제목은 2자 이상 입력해야 합니다.";
      render();
      return;
    }
    if (content.length < 5) {
      state.communityBoardError = "본문은 5자 이상 입력해야 합니다.";
      render();
      return;
    }

    state.communityBoardSaving = true;
    state.communityBoardError = "";
    render();

    const post = {
      id: crypto.randomUUID(),
      category,
      nickname,
      title,
      content,
      createdAt: new Date().toISOString(),
    };

    try {
      if (!backendEnabled()) throw new Error("게시판 서버 설정이 없습니다.");
      const response = await fetch(endpoint(), {
        method: "POST",
        headers: headers({ Prefer: "return=minimal" }),
        body: JSON.stringify({
          category,
          nickname,
          title,
          content,
          hidden: false,
        }),
      });
      if (!response.ok) throw new Error(`게시글 등록 실패 (${response.status})`);
    } catch (error) {
      const posts = [post, ...localPosts()].slice(0, 100);
      saveLocalPosts(posts);
      state.communityBoardError = backendEnabled()
        ? "서버 등록에 실패해 이 브라우저에 임시 저장했습니다."
        : "게시판 서버 설정 전이라 이 브라우저에 임시 저장했습니다.";
      console.warn(error);
    } finally {
      state.communityBoardSaving = false;
      state.communityBoardTab = category;
      state.communityBoardPage = 1;
      state.communityBoardMode = "list";
      state.communityBoardLoaded = false;
      await loadPosts(true);
    }
  }

  async function submitComment(form) {
    const post = state.communityBoardPost;
    if (!post) return;
    const formData = new FormData(form);
    const nickname = String(formData.get("nickname") || "익명").trim().slice(0, limits.nickname) || "익명";
    const content = String(formData.get("content") || "").trim().slice(0, limits.comment);

    if (content.length < 2) {
      state.communityBoardCommentError = "댓글은 2자 이상 입력해야 합니다.";
      render();
      return;
    }

    state.communityBoardCommentSaving = true;
    state.communityBoardCommentError = "";
    render();

    const comment = {
      id: crypto.randomUUID(),
      postId: post.id,
      nickname,
      content,
      createdAt: new Date().toISOString(),
    };

    try {
      if (!backendEnabled() || !boardConfig.commentsTable) throw new Error("댓글 서버 설정이 없습니다.");
      const response = await fetch(tableEndpoint(boardConfig.commentsTable), {
        method: "POST",
        headers: headers({ Prefer: "return=minimal" }),
        body: JSON.stringify({
          post_id: post.id,
          nickname,
          content,
          hidden: false,
        }),
      });
      if (!response.ok) throw new Error(`댓글 등록 실패 (${response.status})`);
      form.reset();
    } catch (error) {
      saveLocalComments([...localComments(), comment].slice(-500));
      state.communityBoardCommentError = backendEnabled()
        ? "서버 등록에 실패해 이 브라우저에 임시 저장했습니다."
        : "댓글 서버 설정 전이라 이 브라우저에 임시 저장했습니다.";
      form.reset();
      console.warn(error);
    } finally {
      state.communityBoardCommentSaving = false;
      await loadComments(post.id);
    }
  }

  function openCommunityBoard() {
    state.communityBoardOpen = true;
    state.communityBoardMode = "list";
    state.communityBoardLoaded = false;
    loadPosts(true);
    render();
  }

  function closeCommunityBoard() {
    state.communityBoardOpen = false;
    state.communityBoardPost = null;
    render();
  }

  function renderTabs() {
    return `
      <div class="community-board-tabs">
        ${categories.map((category) => `
          <button type="button" data-board-tab="${category.id}" class="${state.communityBoardTab === category.id ? "active" : ""}">
            ${escapeHtml(category.label)}
          </button>
        `).join("")}
      </div>
    `;
  }

  function renderList() {
    const totalPages = Math.max(1, Math.ceil(state.communityBoardTotal / pageSize));
    const posts = state.communityBoardPosts || [];
    return `
      ${renderTabs()}
      <div class="community-board-toolbar">
        <span>${escapeHtml(categoryLabel(state.communityBoardTab))} · ${state.communityBoardTotal || 0}개</span>
        <button type="button" data-board-action="write">글쓰기</button>
      </div>
      ${state.communityBoardError ? `<div class="community-board-notice">${escapeHtml(state.communityBoardError)}</div>` : ""}
      <div class="community-board-list">
        ${state.communityBoardLoading
          ? `<div class="community-board-empty">게시글을 불러오는 중입니다.</div>`
          : posts.length
            ? posts.map((post) => `
              <button type="button" class="community-board-row" data-board-post="${post.id}">
                <span class="community-board-row-title">
                  <strong>${escapeHtml(post.title)}</strong>
                  <em>댓글 ${post.commentCount || 0}</em>
                </span>
                <span>${escapeHtml(post.nickname)} · ${formatDate(post.createdAt)}</span>
              </button>
            `).join("")
            : `<div class="community-board-empty">아직 게시글이 없습니다.</div>`}
      </div>
      <div class="community-board-pages">
        <button type="button" data-board-page="prev" ${state.communityBoardPage <= 1 ? "disabled" : ""}>이전</button>
        <span>${state.communityBoardPage} / ${totalPages}</span>
        <button type="button" data-board-page="next" ${state.communityBoardPage >= totalPages ? "disabled" : ""}>다음</button>
      </div>
    `;
  }

  function renderWrite() {
    return `
      ${renderTabs()}
      <form class="community-board-form" data-board-form>
        ${state.communityBoardError ? `<div class="community-board-notice">${escapeHtml(state.communityBoardError)}</div>` : ""}
        <label>
          <span>분류</span>
          <select name="category">
            ${categories.map((category) => `
              <option value="${category.id}" ${state.communityBoardTab === category.id ? "selected" : ""}>${escapeHtml(category.label)}</option>
            `).join("")}
          </select>
        </label>
        <label>
          <span>닉네임</span>
          <input name="nickname" maxlength="${limits.nickname}" placeholder="익명" />
        </label>
        <label>
          <span>제목</span>
          <input name="title" maxlength="${limits.title}" placeholder="제목" required />
        </label>
        <label>
          <span>본문</span>
          <textarea name="content" maxlength="${limits.content}" rows="8" placeholder="내용을 입력하세요." required></textarea>
        </label>
        <div class="community-board-form-actions">
          <button type="button" data-board-action="list">취소</button>
          <button type="submit" ${state.communityBoardSaving ? "disabled" : ""}>${state.communityBoardSaving ? "등록 중" : "등록"}</button>
        </div>
      </form>
    `;
  }

  function renderDetail() {
    const post = state.communityBoardPost;
    const comments = state.communityBoardComments || [];
    return `
      ${renderTabs()}
      <div class="community-board-detail">
        <button type="button" data-board-action="list" class="community-board-back">목록</button>
        ${state.communityBoardError ? `<div class="community-board-notice">${escapeHtml(state.communityBoardError)}</div>` : ""}
        ${state.communityBoardLoading
          ? `<div class="community-board-empty">게시글을 불러오는 중입니다.</div>`
          : post
            ? `
              <article>
                <strong>${escapeHtml(post.title)}</strong>
                <span>${escapeHtml(categoryLabel(post.category))} · ${escapeHtml(post.nickname)} · ${formatDate(post.createdAt)}</span>
                <p>${escapeHtml(post.content).replace(/\n/g, "<br>")}</p>
              </article>
              <section class="community-comments">
                <div class="community-comments-head">
                  <strong>댓글 ${comments.length}</strong>
                  <span>${state.communityBoardCommentsLoading ? "불러오는 중" : ""}</span>
                </div>
                ${state.communityBoardCommentError ? `<div class="community-board-notice">${escapeHtml(state.communityBoardCommentError)}</div>` : ""}
                <div class="community-comment-list">
                  ${comments.length
                    ? comments.map((comment) => `
                      <div class="community-comment">
                        <strong>${escapeHtml(comment.nickname)}</strong>
                        <span>${formatDate(comment.createdAt)}</span>
                        <p>${escapeHtml(comment.content).replace(/\n/g, "<br>")}</p>
                      </div>
                    `).join("")
                    : `<div class="community-board-empty">아직 댓글이 없습니다.</div>`}
                </div>
                <form class="community-comment-form" data-board-comment-form>
                  <input name="nickname" maxlength="${limits.nickname}" placeholder="닉네임" />
                  <input name="content" maxlength="${limits.comment}" placeholder="댓글을 입력하세요." required />
                  <button type="submit" ${state.communityBoardCommentSaving ? "disabled" : ""}>${state.communityBoardCommentSaving ? "등록 중" : "댓글 등록"}</button>
                </form>
              </section>
            `
            : `<div class="community-board-empty">게시글을 찾을 수 없습니다.</div>`}
      </div>
    `;
  }

  function renderCommunityBoard() {
    refs.communityBoardModal.hidden = !state.communityBoardOpen;
    refs.communityBoardMeta.textContent = backendEnabled() ? "서버 게시판" : "로컬 임시 게시판";
    if (!state.communityBoardOpen) return;
    refs.communityBoardPanel.innerHTML = state.communityBoardMode === "write"
      ? renderWrite()
      : state.communityBoardMode === "detail"
        ? renderDetail()
        : renderList();
  }

  function handlePanelClick(event) {
    const tab = event.target.closest("[data-board-tab]")?.dataset.boardTab;
    if (tab) {
      state.communityBoardTab = tab;
      state.communityBoardPage = 1;
      state.communityBoardMode = "list";
      state.communityBoardLoaded = false;
      loadPosts(true);
      render();
      return;
    }

    const action = event.target.closest("[data-board-action]")?.dataset.boardAction;
    if (action === "write") {
      state.communityBoardMode = "write";
      state.communityBoardError = "";
      render();
      return;
    }
    if (action === "list") {
      state.communityBoardMode = "list";
      state.communityBoardPost = null;
      state.communityBoardError = "";
      render();
      return;
    }

    const postId = event.target.closest("[data-board-post]")?.dataset.boardPost;
    if (postId) loadPost(postId);

    const page = event.target.closest("[data-board-page]")?.dataset.boardPage;
    if (page) {
      state.communityBoardPage += page === "next" ? 1 : -1;
      state.communityBoardPage = Math.max(1, state.communityBoardPage);
      state.communityBoardLoaded = false;
      loadPosts(true);
      render();
    }
  }

  function bindCommunityBoardEvents() {
    refs.communityBoardToggle.addEventListener("click", openCommunityBoard);
    refs.communityBoardClose.addEventListener("click", closeCommunityBoard);
    refs.communityBoardModal.addEventListener("click", (event) => {
      if (event.target === refs.communityBoardModal) closeCommunityBoard();
    });
    refs.communityBoardPanel.addEventListener("click", handlePanelClick);
    refs.communityBoardPanel.addEventListener("submit", (event) => {
      const commentForm = event.target.closest("[data-board-comment-form]");
      if (commentForm) {
        event.preventDefault();
        submitComment(commentForm);
        return;
      }
      const form = event.target.closest("[data-board-form]");
      if (!form) return;
      event.preventDefault();
      submitPost(form);
    });
  }

  return {
    bindCommunityBoardEvents,
    closeCommunityBoard,
    loadPosts,
    openCommunityBoard,
    renderCommunityBoard,
  };
}
