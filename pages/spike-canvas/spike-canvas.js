const CANVAS_WIDTH = 750;
const CANVAS_HEIGHT = 2000;
const CHART_LEFT = 96;
const CHART_RIGHT = 678;
const CHART_TOP = 340;
const CHART_BOTTOM = 1620;
const CHART_MIN = 60;
const CHART_MAX = 180;
const SYSTOLIC_POINTS = [126, 134, 148, 140, 144];
const DIASTOLIC_POINTS = [78, 84, 92, 86, 88];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDateTime(date) {
  const target = date instanceof Date ? date : new Date(date);
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  const hours = String(target.getHours()).padStart(2, '0');
  const minutes = String(target.getMinutes()).padStart(2, '0');
  const seconds = String(target.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function getErrorReason(error) {
  if (!error) {
    return 'unknown';
  }

  if (error.errMsg) {
    return error.errMsg;
  }

  if (error.message) {
    return error.message;
  }

  return String(error);
}

function isPermissionInterrupted(error) {
  return /deny|cancel/i.test(getErrorReason(error));
}

function wrapCanvasToTempFilePath(options) {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas: options.canvas,
      fileType: 'png',
      quality: 1,
      success: resolve,
      fail: reject,
    });
  });
}

function wrapSaveImageToPhotosAlbum(filePath) {
  return new Promise((resolve, reject) => {
    wx.saveImageToPhotosAlbum({
      filePath,
      success: resolve,
      fail: reject,
    });
  });
}

function drawHorizontalLine(ctx, startX, endX, y, color) {
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.moveTo(startX, y);
  ctx.lineTo(endX, y);
  ctx.stroke();
  ctx.restore();
}

function buildLinePoints(values) {
  const stepX = (CHART_RIGHT - CHART_LEFT) / (values.length - 1);

  return values.map((value, index) => {
    const x = CHART_LEFT + stepX * index;
    const ratio = (value - CHART_MIN) / (CHART_MAX - CHART_MIN);
    const y = CHART_BOTTOM - ratio * (CHART_BOTTOM - CHART_TOP);
    return { x, y, value };
  });
}

function drawSeries(ctx, points, color, dashPattern) {
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (ctx.setLineDash) {
    ctx.setLineDash(dashPattern || []);
  }

  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
      return;
    }
    ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();

  if (ctx.setLineDash) {
    ctx.setLineDash([]);
  }

  points.forEach((point) => {
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawChart(ctx) {
  const guideValues = [180, 150, 120, 90, 60];

  ctx.save();
  ctx.strokeStyle = '#D1D5DB';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CHART_LEFT, CHART_TOP);
  ctx.lineTo(CHART_LEFT, CHART_BOTTOM);
  ctx.lineTo(CHART_RIGHT, CHART_BOTTOM);
  ctx.stroke();
  ctx.restore();

  guideValues.forEach((value) => {
    const ratio = (value - CHART_MIN) / (CHART_MAX - CHART_MIN);
    const y = CHART_BOTTOM - ratio * (CHART_BOTTOM - CHART_TOP);

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 1;
    if (ctx.setLineDash) {
      ctx.setLineDash([8, 8]);
    }
    ctx.moveTo(CHART_LEFT, y);
    ctx.lineTo(CHART_RIGHT, y);
    ctx.stroke();
    if (ctx.setLineDash) {
      ctx.setLineDash([]);
    }
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value), CHART_LEFT - 16, y);
    ctx.restore();
  });

  const xLabels = ['D1', 'D2', 'D3', 'D4', 'D5'];
  const systolicLine = buildLinePoints(SYSTOLIC_POINTS);
  const diastolicLine = buildLinePoints(DIASTOLIC_POINTS);

  xLabels.forEach((label, index) => {
    const point = systolicLine[index];
    ctx.save();
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(label, point.x, CHART_BOTTOM + 18);
    ctx.restore();
  });

  drawSeries(ctx, systolicLine, '#2563EB', []);
  drawSeries(ctx, diastolicLine, '#DC2626', [16, 10]);

  ctx.save();
  ctx.fillStyle = '#2563EB';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('收缩压（蓝色实线）', CHART_LEFT, 1700);
  ctx.fillStyle = '#DC2626';
  ctx.fillText('舒张压（红色虚线）', CHART_LEFT + 240, 1700);
  ctx.restore();
}

function renderSpikeCanvas(ctx) {
  const generatedAt = formatDateTime(new Date());

  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.fillStyle = '#111111';
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('血压就诊报告（测试）', 48, 56);

  ctx.fillStyle = '#6B7280';
  ctx.font = '14px sans-serif';
  ctx.fillText('这是 spike 测试，验证 canvas 长图导出能力', 48, 106);

  drawHorizontalLine(ctx, 48, CANVAS_WIDTH - 48, 154, '#E5E7EB');
  drawChart(ctx);

  ctx.fillStyle = '#374151';
  ctx.font = '16px sans-serif';
  ctx.fillText(`报告生成时间：${generatedAt}`, 48, 1880);
}

Page({
  data: {
    tempFilePath: '',
    sdkVersion: '',
    deviceModel: '',
    system: '',
    canvasExportStatus: '未开始',
    saveStatus: '未开始',
    isGenerating: false,
    isSaving: false,
  },

  onLoad() {
    const systemInfo = wx.getSystemInfoSync();

    this.setData({
      sdkVersion: systemInfo.SDKVersion || 'unknown',
      deviceModel: systemInfo.model || 'unknown',
      system: systemInfo.system || 'unknown',
    });
  },

  onUnload() {
    this.canvasNode = null;
    this.canvasNodePromise = null;
  },

  getCanvasNode() {
    if (this.canvasNode) {
      return Promise.resolve({
        canvas: this.canvasNode,
        width: this.canvasWidth,
        height: this.canvasHeight,
      });
    }

    if (this.canvasNodePromise) {
      return this.canvasNodePromise;
    }

    this.canvasNodePromise = new Promise((resolve, reject) => {
      wx.createSelectorQuery()
        .select('#spikeCanvas')
        .fields({ node: true, size: true })
        .exec((result) => {
          const target = result && result[0];

          if (!target || !target.node) {
            this.canvasNodePromise = null;
            reject(new Error('未找到 Canvas 2D 节点'));
            return;
          }

          this.canvasNode = target.node;
          this.canvasWidth = target.width || CANVAS_WIDTH;
          this.canvasHeight = target.height || CANVAS_HEIGHT;
          this.canvasNodePromise = null;

          resolve({
            canvas: this.canvasNode,
            width: this.canvasWidth,
            height: this.canvasHeight,
          });
        });
    });

    return this.canvasNodePromise;
  },

  async handleGenerateCanvas() {
    if (this.data.isGenerating) {
      return;
    }

    this.setData({
      isGenerating: true,
      tempFilePath: '',
      canvasExportStatus: '进行中...',
      saveStatus: '未开始',
    });

    const startedAt = Date.now();

    try {
      const { canvas, width, height } = await this.getCanvasNode();
      const ctx = canvas.getContext('2d');

      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;

      renderSpikeCanvas(ctx);
      await wait(80);

      const result = await wrapCanvasToTempFilePath({ canvas });
      const duration = Date.now() - startedAt;
      const tempFilePath = result.tempFilePath || '';

      this.setData({
        tempFilePath,
        canvasExportStatus: `成功(${duration}ms)`,
      });

      console.log('[spike-canvas] export success', {
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        nodeWidth: width,
        nodeHeight: height,
        durationMs: duration,
        tempFilePath,
      });
    } catch (error) {
      const reason = getErrorReason(error);

      this.setData({
        canvasExportStatus: `失败(${reason})`,
        tempFilePath: '',
      });

      console.error('[spike-canvas] export failed', error);
      wx.showToast({
        title: '生成失败',
        icon: 'error',
      });
    } finally {
      this.setData({
        isGenerating: false,
      });
    }
  },

  async handleSaveToAlbum() {
    if (this.data.isSaving) {
      return;
    }

    if (!this.data.tempFilePath) {
      wx.showToast({
        title: '请先生成长图',
        icon: 'none',
      });
      return;
    }

    this.setData({
      isSaving: true,
      saveStatus: '进行中...',
    });

    const startedAt = Date.now();

    try {
      const result = await wrapSaveImageToPhotosAlbum(this.data.tempFilePath);
      const duration = Date.now() - startedAt;

      this.setData({
        saveStatus: '成功',
      });

      console.log('[spike-canvas] save success', {
        durationMs: duration,
        result,
      });

      wx.showToast({
        title: '已保存',
        icon: 'success',
      });
    } catch (error) {
      const duration = Date.now() - startedAt;
      const reason = getErrorReason(error);

      this.setData({
        saveStatus: `失败(${reason})`,
      });

      if (isPermissionInterrupted(error)) {
        console.log('[spike-canvas] save permission interrupted', {
          durationMs: duration,
          error,
        });

        wx.showModal({
          title: '提示',
          content: '需要相册权限才能保存',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) {
              wx.openSetting({});
            }
          },
        });
        return;
      }

      console.error('[spike-canvas] save failed', {
        durationMs: duration,
        error,
      });

      wx.showToast({
        title: '保存失败',
        icon: 'error',
      });
    } finally {
      this.setData({
        isSaving: false,
      });
    }
  },
});
