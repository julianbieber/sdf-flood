#version 450 
layout (location = 0) out vec4 out_color;
  
layout (location = 0) in vec2 uv;   
layout (binding  = 0) uniform UniformParameters {
    float time;
} u;
layout (binding  = 1) readonly buffer fftBuffer{
    float v[];
} fft;
layout(binding = 3) readonly buffer eyeBuffer {
    float v[];
} eyes;
layout (binding  = 2) readonly buffer SliderParameters{
    float v[];
} sliders;


#define PI 3.1415926538
#define TAU 6.2831853071
#define FOV 60.0
#define T u.time * 0.2

vec3 rgb(int r, int g, int b) {
    return vec3(float(r) / 255.0, float(g) / 255.0, float(b) / 255.0);
}


float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

vec2 rotate2(vec2 p, float angle) {
    return mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * 
        p;
}


float gy(vec2 a, vec2 b) {
    return dot(sin(a), cos(b.yx));
}


vec3 lighning(vec2 v) {
    vec3 baseColor1 = rgb(8, 118, 253);
    vec3 baseColor2 = rgb(186, 48, 223);

    float end = 20.0;

    float intensity_acc = 0.0;
    float inverse_intensity_acc = 0.0;

    vec2 original = v;
    v *= 10.0+T;
    // v *= dot(v, v)*T;
    // v *= fract(cos(T*32143.1));
    v = rotate2(v, T);
    // v += fract(cos(T*12143.1+v.x))*0.1;

    float background_intensity_acc = 0.0;

    for (float i = 1.0; i < end; ++i) {
        float scale = 1.0/i;
        float path = sin(v.x * 10.0 + 100.0*T) * 0.1 +
                     sin(v.x * 23.0 + 100.0*T* 1.3) * 0.05 +
                     sin(v.x * 47.0 + 100.0*T* 0.7) * 0.025;

        float lightning_distance = abs(v.y - path);
        float glow = exp(-lightning_distance-0.1); 
        glow = 1.0;

        vec2 focus_v = original*10.0;
        focus_v += i*0.1+sin(T);

        // focus_v += abs(sin(focus_v*6.0 + T*10.0 + v.x));
        // focus_v = rotate2(focus_v, lightning_distance);

        float focus_distance = max(0.0, 1.0 - length(focus_v));
        focus_distance = 1.0;
        intensity_acc += (1.0 / (lightning_distance * 100.0 + 1.0)) * glow * focus_distance;
        // intensity_acc += glow;


        float background_distance = max(0.0, 3.0 - length(v*background_intensity_acc))*glow*2.0*exp(-intensity_acc);
        background_intensity_acc += background_distance * 0.01 * scale;
        
        // v = rotate2(v, 1.0/end*2.0*PI+original.x*10.0);
        v = rotate2(v, PI * (1.0 - lightning_distance)*scale);
        // v += intensity_acc*3.0*sin(T);

        // v.y = sin(v.y*2.0);
    }

    vec3 color = baseColor1 * (intensity_acc);
    vec3 background = baseColor2 * background_intensity_acc;
    return mix(color, background, 1.0-intensity_acc);
}

void main(){
    vec2 v = ((uv - 0.5) * vec2(1.92, 1.2)) / 1.2;
    // vec3 ray_direction = normalize(vec3(pixel_position, 1.0)); 

    // vec3 ro = vec3(0.0, 0.0, -10.0);
    // vec3 rd = normalize(vec3(pixel_position, 1.0));
    //
    vec3 baseColor1 = rgb(8, 118, 253);
    // vec3 baseColor1 = rgb(166, 47, 32);
    vec3 baseColor2 = rgb(186, 48, 223);

    float end = 20.0;
    // v *=10.0;

    // vec2 intensity = vec2(0.0);
    // for (float i = 1.0; i < end; ++i) {
    //     float scale = 1.0 / end;
    //     v = rotate2(v.yx, scale*T*length(sin(v)));
    //     v += sin(i*v)*0.1;
    //     v *= sin(v*7.0);
    //     v += cos(10*v + T);
    //     v += tan(i * T);
    //     v += sin(i);
    //     vec2 li = tanh(1.5 * v / (0.5 - dot(v, v)) + sin(T));
    //     li -= v.xy;
    //     li -= sin(li);
    //     li /= T;
    //     li = sin(li);
    //     li *= 1.0 + i * dot(cos(v - T), sin(v - T));
    //     intensity += rotate2(v, T)*(tanh(1.0 - li) + 1.0) * 0.5 * scale * (1.0-length(v));
    // }
    // intensity =(tanh(intensity) + 1.0) * 0.5;
    // vec3 color = mix(baseColor1*intensity.x, baseColor2*intensity.y, intensity.x / (intensity.x + intensity.y));
    // out_color = vec4(color , 1.0);

    float intensity_acc = 0.0;
    float inverse_intensity_acc = 0.0;

    // v -= v * (sin(T))*tan(T);

    // for (float i = 1.0; i < end; ++i) {

    //     v -= .01*T;
    //     v += cos(v*vec2(60.0*i, 44.0)+T*i)*0.01;
    //     v -= sin(v.yx*vec2(50.0*i, 54.0*i)+T*i)*0.01;
    //     // v = rotate2(v, PI * dot(v/T, v.yx*T));
    //     // v = v.yx;
    //     float intensity_multiplier = 1.0 / i;
    //     float gyroidal  = dot(sin(v), cos(v.yx));
    //     float dist_from_center = length((v* 30.0)*gyroidal);
    //     intensity_multiplier += dot(v/T, v.yx*T);
    //     // dist_from_center *= pow(dist_from_center, dot(v, v));
    //     intensity_acc += max(1.0 - dist_from_center, 0.0) * intensity_multiplier;

    //     v += gyroidal;
    //     v += dot(v/T, v.yx*T)*0.0002;
    //     dist_from_center = length((rotate2(v, PI)* 30.0)*gyroidal);
    //     inverse_intensity_acc += max(1.0 - dist_from_center, 0.0) * intensity_multiplier;

    //     // inverse_intensity_acc = tanh(inverse_intensity_acc);
        
    // }


    vec2 original = v;
    // v *= sin(T)+2.0;

    // for (float i = 1.0; i < end; ++i) {
    //     float scale = 1.0/i;

    //     v += intensity_acc*0.1;
    //     v = rotate2(v, 2.0*PI* 1./end + length(original));


    //     vec2 color_v = v;
    //     color_v = sin(color_v * 30.0 + T * original.x*v.y);
    //     color_v = rotate2(color_v, T);
    //     color_v /= gy(color_v+original, color_v*T * original);
        
    //     float d = length(color_v);
    //     intensity_acc += max(0.0, 1.0 - d) * scale;

    //     baseColor1 = rotate(baseColor1, intensity_acc+T, v.y+T, v.x+T);
    //     baseColor1 = rotate(baseColor1, baseColor1.x, baseColor1.y, baseColor1.z);
        
    // }
    //
    v *= 10.0+T;
    // v *= dot(v, v)*T;
    // v *= fract(cos(T*32143.1));
    v = rotate2(v, T);
    // v += fract(cos(T*12143.1+v.x))*0.1;

    float background_intensity_acc = 0.0;

    for (float i = 1.0; i < end; ++i) {
        float scale = 1.0/i;
        float path = sin(v.x * 10.0 + 100.0*T) * 0.1 +
                     sin(v.x * 23.0 + 100.0*T* 1.3) * 0.05 +
                     sin(v.x * 47.0 + 100.0*T* 0.7) * 0.025;

        float lightning_distance = abs(v.y - path);
        float glow = exp(-lightning_distance-0.1); 
        glow = 1.0;

        vec2 focus_v = original*10.0;
        focus_v += i*0.1+sin(T);

        // focus_v += abs(sin(focus_v*6.0 + T*10.0 + v.x));
        // focus_v = rotate2(focus_v, lightning_distance);

        float focus_distance = max(0.0, 1.0 - length(focus_v));
        focus_distance = 1.0;
        intensity_acc += (1.0 / (lightning_distance * 100.0 + 1.0)) * glow * focus_distance;
        // intensity_acc += glow;


        float background_distance = max(0.0, 3.0 - length(v*background_intensity_acc))*glow*2.0*exp(-intensity_acc);
        background_intensity_acc += background_distance * 0.01 * scale;
        
        // v = rotate2(v, 1.0/end*2.0*PI+original.x*10.0);
        v = rotate2(v, PI * (1.0 - lightning_distance)*scale);
        // v += intensity_acc*3.0*sin(T);

        // v.y = sin(v.y*2.0);
    }

    vec3 color = baseColor1 * (intensity_acc);
    vec3 background = baseColor2 * background_intensity_acc;
    out_color = vec4(mix(color, background, 1.0-intensity_acc), 1.0);
    // if (intensity_acc > background_intensity_acc) {
    //     out_color = vec4(color, 1.0);
    // } else {
    //     out_color = vec4(background, 1.0);
    // }
    // out_color = vec4(v, 0.0, 1.0);
} 
