#version 450
layout(location = 0) out vec4 out_color;

layout(location = 0) in vec2 uv;
layout(binding = 0) uniform UniformParameters {
    float time;
} u;
layout(binding = 1) readonly buffer fftBuffer {
    float v[];
} fft;
layout(binding = 2) readonly buffer SliderParameters {
    float v[];
} sliders;

#define PI 3.1415926538
#define TAU 6.2831853071

float rand2(vec2 x) {
    // return fract(sin(x.x * 2382.0 * x.y *1786.0));
    return fract(sin(dot(x, vec2(12.9898,78.233)))*43758.5453123+u.time);
}

vec4 yasi(vec2 p) {
    return vec4(1.0);
}

vec4 julian(vec2 p) {
    return vec4(0.0);
}

void main() {
    vec2 pixel_position = ((uv - 0.5) * vec2(1.92, 1.2)) / 1.2;

    if (rand2(pixel_position) < (sin(u.time) + 1.0) / 2.0) {
        out_color = yasi(pixel_position);
    } else {
        out_color = julian(pixel_position);
    }
}
