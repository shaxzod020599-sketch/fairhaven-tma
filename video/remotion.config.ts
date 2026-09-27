import {Config} from '@remotion/cli/config';

// WebGL scenes (shader macro + 3D bottle) need the GPU-backed ANGLE renderer on macOS.
Config.setChromiumOpenGlRenderer('angle');
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(96);
Config.setCodec('h264');
Config.setCrf(15);
Config.setPixelFormat('yuv420p');
Config.setConcurrency(3);
Config.setOverwriteOutput(true);
