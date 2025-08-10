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

struct Ob {
    float d;
    int c;
    bool density;
};

Ob min_ob(Ob a, Ob b) {
    if (a.density) {
        a.d = max(0.0, a.d);
    }
    if (b.density) {
        b.d = max(0.0, b.d);
    }
    if (a.d <= b.d) {
        return a;
    } else {
        return b;
    }
}

Ob max_ob(Ob a, Ob b) {
    if (a.density) {
        a.d = max(0.0, a.d);
    }
    if (b.density) {
        b.d = max(0.0, b.d);
    }
    if (a.d >= b.d) {
        return a;
    } else {
        return b;
    }
}

vec3 foldPlane(vec3 p, vec3 n, float d) {
    float dist = dot((p), n) + d;
    if (dist < 0.0) {
        p -= 2.0 * dist * n;
    }
    return p;
}

vec3 rotate(vec3 p, float yaw, float pitch, float roll) {
    return (mat3(cos(yaw), -sin(yaw), 0.0, sin(yaw), cos(yaw), 0.0, 0.0, 0.0, 1.0) * 
        mat3(cos(pitch), 0.0, sin(pitch), 0.0, 1.0, 0.0, -sin(pitch), 0.0, cos(pitch)) * 
        mat3(1.0,0.0,0.0,0.0, cos(roll), -sin(roll),0.0, sin(roll), cos(roll))) * 
        p;
}
vec2 rotate2(vec2 p, float angle) {
    return mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * 
        p;
}
float sphere(vec3 p,float radius) {
    return length(p) - radius;
}

Ob map(vec3 p) {
    return Ob(sphere(p, 1.0), 0, false);
}

vec3 normal( in vec3 p ) // for function f(p)
{
    const float eps = 0.0001; // or some other value
    const vec2 h = vec2(eps,0);
    return normalize( vec3(map(p+h.xyy).d - map(p-h.xyy).d,
                           map(p+h.yxy).d - map(p-h.yxy).d,
                           map(p+h.yyx).d - map(p-h.yyx).d ) );
}

vec3 march(vec3 ro, vec3 rd) {
    float t = 0.0;
    for (int i = 0; i < 100; ++i) {
        vec3 p = ro + rd * t;
        
        Ob o = map(p);

        if (o.d < 0.001) {
            vec3 n = normal(p);
            float i = dot(n, vec3(0.0, 1.0, 0.0));
            return vec3(1.0) * i;
        }

        t += o.d;
    }

    return vec3(0.0);
}


float gy(vec2 a, vec2 b) {
    return dot(sin(a), cos(b.yx));
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
    v *= 10.0;
    // v *= dot(v, v)*T;
    v += fract(cos(T*12321.0));

    float background_intensity_acc = 0.0;

    for (float i = 1.0; i < end; ++i) {
        float scale = 1.0/i;
        float path = sin(v.x * 10.0 + 100.0*T) * 0.1 +
                     sin(v.x * 23.0 + 100.0*T* 1.3) * 0.05 +
                     sin(v.x * 47.0 + 100.0*T* 0.7) * 0.025;
    
        float lightning_distance = abs(v.y - path);
        intensity_acc += (1.0 / (lightning_distance * 100.0 + 1.0)) * max(0.0, 0.4 - length(cos(v+T+path+original.x)));

        float background_distance = max(0.0, 3.0 - length(v*background_intensity_acc))*1.0;
        background_intensity_acc += background_distance * 0.01 * scale;


        
        v = rotate2(v, 0.21*PI*length(original+T));
        v += intensity_acc*3.0;

        v.y = sin(v.y*2.0);
    }

    vec3 color = baseColor1 * (intensity_acc);
    vec3 background = baseColor2 * background_intensity_acc;
    if (intensity_acc > background_intensity_acc) {
        out_color = vec4(color, 1.0);
    } else {
        out_color = vec4(background, 1.0);
    }
    // out_color = vec4(v, 0.0, 1.0);
} 
