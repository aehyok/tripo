/**
 * 目标卡片图：按当前占位模型画一只穿绿色球衣的小狗。
 * 正式模型接入后，把这里替换成与模型一致的出图即可。
 */
export function dogThumbnail() {
  const S = 224;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');

  const bg = c.createLinearGradient(0, 0, 0, S);
  bg.addColorStop(0, '#ffc94d');
  bg.addColorStop(1, '#ffb31a');
  c.fillStyle = bg;
  c.fillRect(0, 0, S, S);

  /* 地面阴影 */
  c.fillStyle = 'rgba(29,22,69,.18)';
  c.beginPath();
  c.ellipse(112, 186, 74, 12, 0, 0, Math.PI * 2);
  c.fill();

  const fur = '#d99a5b';
  const furDark = '#b97b3f';
  const jersey = '#12a66a';

  const rr = (x, y, w, h, r, fill) => {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
  };

  /* 尾巴 */
  c.strokeStyle = furDark;
  c.lineWidth = 11;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(46, 118);
  c.quadraticCurveTo(24, 100, 32, 76);
  c.stroke();

  /* 后腿、前腿 */
  rr(52, 150, 22, 40, 10, furDark);
  rr(78, 152, 20, 38, 9, fur);
  rr(140, 150, 22, 40, 10, furDark);
  rr(162, 152, 20, 38, 9, fur);

  /* 身体 */
  c.beginPath();
  c.ellipse(110, 124, 62, 40, -0.04, 0, Math.PI * 2);
  c.fillStyle = fur;
  c.fill();

  /* 球衣 */
  c.beginPath();
  c.ellipse(104, 122, 50, 34, -0.04, 0, Math.PI * 2);
  c.fillStyle = jersey;
  c.fill();
  c.fillStyle = '#fff4dc';
  c.fillRect(56, 118, 96, 7);
  c.fillRect(96, 92, 9, 32);
  c.fillStyle = 'rgba(255,255,255,.18)';
  c.beginPath();
  c.ellipse(88, 108, 26, 12, -0.2, 0, Math.PI * 2);
  c.fill();

  /* 头 */
  c.beginPath();
  c.arc(160, 92, 35, 0, Math.PI * 2);
  c.fillStyle = fur;
  c.fill();

  /* 耳朵 */
  c.beginPath();
  c.ellipse(136, 70, 13, 24, 0.5, 0, Math.PI * 2);
  c.fillStyle = furDark;
  c.fill();
  c.beginPath();
  c.ellipse(184, 74, 12, 22, -0.45, 0, Math.PI * 2);
  c.fillStyle = furDark;
  c.fill();

  /* 口鼻 */
  c.beginPath();
  c.ellipse(186, 104, 20, 14, 0.1, 0, Math.PI * 2);
  c.fillStyle = '#f0c79a';
  c.fill();
  c.beginPath();
  c.ellipse(199, 99, 7, 6, 0, 0, Math.PI * 2);
  c.fillStyle = '#1d1645';
  c.fill();

  /* 眼睛 */
  c.beginPath();
  c.arc(170, 84, 4.6, 0, Math.PI * 2);
  c.fillStyle = '#1d1645';
  c.fill();
  c.beginPath();
  c.arc(152, 86, 4.2, 0, Math.PI * 2);
  c.fill();

  /* 高光 */
  c.beginPath();
  c.arc(171.6, 82.4, 1.6, 0, Math.PI * 2);
  c.fillStyle = '#fff4dc';
  c.fill();
  c.beginPath();
  c.arc(153.4, 84.4, 1.4, 0, Math.PI * 2);
  c.fill();

  return cv.toDataURL();
}
