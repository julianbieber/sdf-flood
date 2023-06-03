#version 450 
layout (location = 0) out vec4 out_color;
  
layout (location = 0) in vec2 uv;   
layout (binding  = 0) uniform UniformParameters {
    float time;
} u;
layout (binding  = 1) readonly buffer fftBuffer{
    float v[];
} fft;
layout (binding  = 2) readonly buffer SliderParameters{
    float v[];
} sliders;


#define PI 3.1415926538
#define TAU 6.2831853071
#define FOV 60.0

struct SceneSample {
    float closest_distance;
    int index;
};

struct RayEnd {
    SceneSample s;
    vec3 current_position;
};

float smin( float a, float b, float k ) {
    float h = clamp( 0.5+0.5*(b-a)/k, 0.0, 1.0 );
    return mix( b, a, h ) - k*h*(1.0-h);
}


vec3 rotate(vec3 p, float yaw, float pitch, float roll) {
    return (mat3(cos(yaw), -sin(yaw), 0.0, sin(yaw), cos(yaw), 0.0, 0.0, 0.0, 1.0) * 
        mat3(cos(pitch), 0.0, sin(pitch), 0.0, 1.0, 0.0, -sin(pitch), 0.0, cos(pitch)) * 
        mat3(1.0,0.0,0.0,0.0, cos(roll), -sin(roll),0.0, sin(roll), cos(roll))) * 
        p;
}
float sphere(vec3 p, vec3 center, float radius) {
    return length(p - center) - radius;
}
float sdPlane( vec3 p, vec3 n, float h ) {
  // n must be normalized
  return dot(p,n) + h;
}

float sdVerticalCapsule( vec3 p, float h, float r ) {
  p.y -= clamp( p.y, 0.0, h );
  return length( p ) - r;
}
float sdCapsule( vec3 p, vec3 a, vec3 b, float r ) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp( dot(pa,ba)/dot(ba,ba), 0.0, 1.0 );
  return length( pa - ba*h ) - r;
}

float sub(float d1, float d2) {
    return max(-d1, d2);
}

SceneSample combine(SceneSample a, SceneSample b) {
    if (b.closest_distance < a.closest_distance) {
        return b;
    } else {
        return a;
    }
}

float wobble(vec3 p, float angle) {
    p -= vec3(0.0, 0.25, 0.0);
    p = rotate(p, 0.0, 0.0, 0.0);
    p += vec3(0.0, 0.25, 0.0);

    float x = cos(angle) * 2.0;
    float z = sin(angle) * 2.0;
    p -= vec3(x, -1.0, z);
    float w = sdVerticalCapsule(p, 0.5, 0.5);
    return w;
}

float ghost(vec3 p) {
    p -= vec3(0.0, -1.0, 10.0);
    float s1 = sdVerticalCapsule(p, 2.0, 2.0);

    for (float i = 0; i < 6.0; ++i) {
        float o = i * TAU / 6.0;
        float w = wobble(p, o + u.time);
        s1 = smin(w, s1, 0.1);

    }

    p += vec3(0.0, -1.0, 10.0);
    float extension_plane = sdPlane(p, vec3(0.0, 1.0, 0.0), 2.0);
    s1 = smin(extension_plane, s1, 3.0);


    

    
    s1 = sub(sdPlane(p, vec3(0.0, 1.0, 0.0), 1.5), s1);
    return s1;
}

float mouth(vec3 p) {
    float s = sphere(p, vec3(0.0, 0.0, 8.0), 0.3);
    float smile_subtraction = sphere(p, vec3(0.05, 0.1, 7.9), 0.31);
    return sub(smile_subtraction, s);
}



SceneSample scene(vec3 p) {
    SceneSample g = SceneSample(ghost(p), 1);
    // return g;
    SceneSample e1 = SceneSample(sphere(p, vec3(-0.5, 0.8, 8.0), 0.3), 2);
    SceneSample e2 = SceneSample(sphere(p, vec3(0.5, 0.8, 8.0), 0.3), 2);
    SceneSample m = SceneSample(mouth(p), 2);
    
    return combine(combine(combine(g, e1), e2), m);
}

float scene_f(vec3 p) {
    return scene(p).closest_distance;
}

vec3 normal( in vec3 p ) // for function f(p)
{
    const float eps = 0.0001; // or some other value
    const vec2 h = vec2(eps,0);
    return normalize( vec3(scene_f(p+h.xyy) - scene_f(p-h.xyy),
                           scene_f(p+h.yxy) - scene_f(p-h.yxy),
                           scene_f(p+h.yyx) - scene_f(p-h.yyx) ) );
}
float fov_factor() {
    return tan(FOV / 2.0 * PI / 180.0);
}



RayEnd follow_ray(vec3 start, vec3 direction, int steps, float max_dist) {
    float traveled = 0.0;
    for (int i = 0; i < steps; ++i) {
        vec3 p = start + direction * traveled;
        SceneSample s = scene(p);
        if (s.closest_distance < 0.01) {
            return RayEnd(s, p);
        }
        if (traveled >= max_dist) {
            break;
        }
        traveled += s.closest_distance;
    }

    return RayEnd(SceneSample(traveled, -1), start + direction * traveled);
}

vec4 resolve_color(int index, vec3 p) {
    if (index == 1) {
        vec3 n = normal(p);
        float v = dot(n, vec3(1.0, 1.0, 0.3));
        return vec4(1.0) * max(v, 0.4);
    } else if (index == 2 || index == 3) {
        return vec4(0.0);
    }

    return vec4(0.0);
}

bool is_light(int index) {
    return index == 1  || index == 2 || index == 3;
}

vec4 render(vec3 eye, vec3 ray) {
    RayEnd end = follow_ray(eye, ray, 100, 100.0);
    if (end.s.index == -1) {
        return vec4(0.0);
    }
    vec4 color = resolve_color(end.s.index, end.current_position);
    return color;
}

void main(){
    float fov = fov_factor();
    vec2 pixel_position = ((uv - 0.5) * vec2(1.92, 1.2)) / 1.2;
    vec3 ray_direction = normalize(vec3(pixel_position, 1.0)); 

    out_color = render(vec3(0.0), ray_direction);
    // out_color = vec4(pixel_position, 0.0, 1.0);
    // out_color = vec4(sin(sdFbm(vec3(uv * 40.0, 0.0), 7.0)), 0.0, 0.0, 1.0);
} 