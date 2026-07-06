/* ============ SHARED MEDIA HELPER (media.js) ============
   Used by index.html, project.html, explore.html, and about.html to turn a
   single URL from content.json into the right markup — an <img> for
   pictures/GIFs, a <video> for direct video files, or an <iframe> for
   YouTube/Vimeo links. Also still handles Google Drive "share" links for
   images, exactly like before.

   Usage:
     MediaEmbed.resolve(url)              -> { type, url, embedUrl }
     MediaEmbed.markup(url, alt, opts)    -> HTML string ready to insert
     MediaEmbed.aspect(url)               -> Promise<number> (width / height)

   opts (all optional): { className, loading, autoplay, muted, loop, controls }
   ========================================================== */
(function (global) {
  'use strict';

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  // Google Drive "share" link (…/file/d/FILE_ID/view?usp=sharing) -> a
  // directly-loadable image URL. Drive doesn't offer a public direct-stream
  // link for video, so Drive links are always treated as images (matches
  // the site's previous behavior).
  function driveImageUrl(url, size) {
    var match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    var id = match ? match[1] : null;
    if (!id) return url;
    return 'https://drive.google.com/thumbnail?id=' + id + '&sz=w' + (size || 1200);
  }

  function isDriveLink(url) {
    return /drive\.google\.com/.test(url) || /googleusercontent\.com/.test(url);
  }

  function getYouTubeId(url) {
    var m = url.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{6,})/);
    return m ? m[1] : null;
  }

  function getVimeoId(url) {
    var m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    return m ? m[1] : null;
  }

  function getExtension(url) {
    var clean = url.split('#')[0].split('?')[0];
    var m = clean.match(/\.([a-zA-Z0-9]+)$/);
    return m ? m[1].toLowerCase() : '';
  }

  var VIDEO_EXT = ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v'];
  var IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif', 'bmp'];

  // Figures out what kind of media a URL points to and, where needed, what
  // URL to actually put in the src/href.
  function resolve(url) {
    if (!url) return { type: 'none', url: '', embedUrl: '' };
    url = String(url).trim();

    var ytId = getYouTubeId(url);
    if (ytId) {
      return { type: 'youtube', url: url, embedUrl: 'https://www.youtube.com/embed/' + ytId };
    }
    var vimeoId = getVimeoId(url);
    if (vimeoId) {
      return { type: 'vimeo', url: url, embedUrl: 'https://player.vimeo.com/video/' + vimeoId };
    }

    var ext = getExtension(url);
    if (VIDEO_EXT.indexOf(ext) !== -1) {
      return { type: 'video', url: url, embedUrl: url };
    }

    if (isDriveLink(url)) {
      return { type: 'image', url: driveImageUrl(url), embedUrl: driveImageUrl(url) };
    }

    // Unknown extension (no extension, tracking params, etc.) or a known
    // image/GIF extension — treat as an image, same as the site always has.
    return { type: 'image', url: url, embedUrl: url };
  }

  // Builds ready-to-insert HTML for a media URL. `alt` is used for
  // image/video accessibility text; iframes get a title instead.
  function markup(url, alt, opts) {
    opts = opts || {};
    var info = resolve(url);
    var safeAlt = escapeHtml(alt || '');
    var cls = opts.className ? ' class="' + escapeHtml(opts.className) + '"' : '';
    var loading = opts.loading !== false ? ' loading="lazy"' : '';

    if (info.type === 'none') return '';

    if (info.type === 'youtube' || info.type === 'vimeo') {
      return '<iframe' + cls + ' src="' + escapeHtml(info.embedUrl) + '" title="' + safeAlt +
        '" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>';
    }

    if (info.type === 'video') {
      var autoplay = opts.autoplay ? ' autoplay' : '';
      var muted = (opts.muted !== false) ? ' muted' : ''; // default muted so autoplay isn't blocked
      var loop = opts.loop ? ' loop' : '';
      var controls = opts.controls === false ? '' : ' controls';
      var playsinline = ' playsinline';
      return '<video' + cls + controls + autoplay + muted + loop + playsinline +
        ' preload="metadata" aria-label="' + safeAlt + '"><source src="' + escapeHtml(info.embedUrl) + '"></video>';
    }

    // image (includes GIFs — a GIF is just an <img> the browser animates)
    return '<img' + cls + ' src="' + escapeHtml(info.embedUrl) + '" alt="' + safeAlt + '"' + loading + '>';
  }

  // Resolves the natural aspect ratio (width / height) of an image or
  // video URL. Falls back to 1 (square) for iframes/embeds or on error,
  // since those cases don't expose natural dimensions the same way.
  function aspect(url) {
    var info = resolve(url);
    return new Promise(function (resolvePromise) {
      if (info.type === 'none') { resolvePromise(1); return; }

      if (info.type === 'video') {
        var v = document.createElement('video');
        v.onloadedmetadata = function () {
          resolvePromise((v.videoWidth && v.videoHeight) ? (v.videoWidth / v.videoHeight) : 1);
        };
        v.onerror = function () { resolvePromise(1); };
        v.src = info.embedUrl;
        return;
      }

      if (info.type === 'youtube' || info.type === 'vimeo') {
        resolvePromise(16 / 9); // standard embed ratio, can't read the real one cross-origin
        return;
      }

      var img = new Image();
      img.onload = function () {
        resolvePromise((img.naturalWidth && img.naturalHeight) ? (img.naturalWidth / img.naturalHeight) : 1);
      };
      img.onerror = function () { resolvePromise(1); };
      img.src = info.embedUrl;
    });
  }

  global.MediaEmbed = {
    resolve: resolve,
    markup: markup,
    aspect: aspect,
    escapeHtml: escapeHtml
  };
})(window);
