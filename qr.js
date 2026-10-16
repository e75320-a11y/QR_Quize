// QR 코드 전용 스크립트 (외부 라이브러리 불필요)
// QR 이미지는 qrserver API로 생성하므로 CDN 로드 실패와 무관하게 동작합니다.
(function () {
  function playerUrl() {
    return new URL('player.html', location.href).href;
  }
  function qrImageUrl(url, size) {
    return 'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size +
      '&margin=12&data=' + encodeURIComponent(url);
  }

  var qrImage = document.getElementById('qrImage');
  var qrUrl = document.getElementById('qrUrl');
  var copyBtn = document.getElementById('copyBtn');
  var fsBtn = document.getElementById('fullscreenQrBtn');
  var fs = document.getElementById('fullscreenQr');
  var fsImg = document.getElementById('fullscreenQrImage');
  var fsUrl = document.getElementById('fullscreenQrUrl');
  var fsBack = document.getElementById('fullscreenBackBtn');

  var url = playerUrl();
  qrUrl.value = url;
  qrImage.src = qrImageUrl(url, 600);
  qrImage.alt = 'QR 코드';

  copyBtn.addEventListener('click', function () {
    var done = function () {
      copyBtn.textContent = '복사됨!';
      setTimeout(function () { copyBtn.textContent = '복사'; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(qrUrl.value).then(done).catch(function () {
        qrUrl.select();
        document.execCommand('copy');
        done();
      });
    } else {
      qrUrl.select();
      document.execCommand('copy');
      done();
    }
  });

  if (fsBtn) {
    fsBtn.addEventListener('click', function () {
      qrUrl.value = url;
      fsUrl.textContent = url;
      fsImg.src = qrImageUrl(url, 1000);
      fsImg.alt = 'QR 코드';
      fs.hidden = false;
    });
  }
  if (fsBack) {
    fsBack.addEventListener('click', function () { fs.hidden = true; });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && fs && !fs.hidden) fs.hidden = true;
  });
})();
