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
#define T u.time * 0.02
#define E 2.718

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
float sphere(vec3 p,float radius) {
    return length(p) - radius;
}
float noise(vec3 v) {
    float a = dot(sin(v), sin(v.yzx));
    for (int i = 1; i < 2; ++i) {
        v = rotate(v, T, T, 1.4* T* 1.0/(float(i)));
        a += dot(sin(v), sin(v.yzx));
        a *= 0.5;
    }

    return a;
}

float billow(vec3 v) {
    float lunacricy = 2.0;
    float dampening = 0.5;
    float a = 1.0;
    float t = 0.0;
    for (int i = 0; i < 3; ++i) {
        t += abs(a*noise(float(i) * lunacricy * v));
        a *= dampening;

    }

    return t;
}


Ob map(vec3 p) {
    float d = billow(p);
    return Ob(d, 0, false);
}

vec3 normal( in vec3 p ) // for function f(p)
{
    const float eps = 0.0001; // or some other value
    const vec2 h = vec2(eps,0);
    return normalize( vec3(map(p+h.xyy).d - map(p-h.xyy).d,
                           map(p+h.yxy).d - map(p-h.yxy).d,
                           map(p+h.yyx).d - map(p-h.yyx).d ) );
}

vec3 color_f(float d, vec3 p) {
    float intensity = pow(E, -abs(d));

    vec3 c = tanh(sin(rotate(p, billow(p*4.0), T, 0.0)) * vec3(1.0, 2.0, 4.0));

    for (float i = 0.1; i < abs(d); i*=2.4) {
        c *= billow(c*sin(T))*i;
    }

    return abs(tanh(c * intensity)) ;
}

vec3 march(vec3 ro, vec3 rd) {
    float t = 0.0;
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 100; ++i) {
        vec3 p = ro + rd * t;
        
        Ob o = map(p);

        if (o.d < 0.01 && o.d > -1.5) {
            acc += color_f(o.d, p);
            acc *= length(tanh(acc))*0.3;
        }

        t += o.d+0.01;
    }

    return acc;
}


void main(){
    vec2 pixel_position = ((uv - 0.5) * vec2(1.92, 1.2)) / 1.2;
    vec3 ray_direction = normalize(vec3(pixel_position, 1.0)); 

    vec3 ro = vec3(T*T, T, -10.0);
    vec3 rd = normalize(vec3(pixel_position, 1.0))*sin(T);


    out_color = vec4(march(ro, rd), 1.0);
} 
