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

struct SceneSample {
    float closest_distance;
    int index;
};

struct RayEnd {
    SceneSample s;
    vec3 current_position;
};

vec3 rotate(vec3 p, float yaw, float pitch, float roll) {
    return (mat3(cos(yaw), -sin(yaw), 0.0, sin(yaw), cos(yaw), 0.0, 0.0, 0.0, 1.0) * 
        mat3(cos(pitch), 0.0, sin(pitch), 0.0, 1.0, 0.0, -sin(pitch), 0.0, cos(pitch)) * 
        mat3(1.0,0.0,0.0,0.0, cos(roll), -sin(roll),0.0, sin(roll), cos(roll))) * 
        p;
}
float sphere(vec3 p, vec3 center, float radius) {
    return length(p - center) - radius;
}
float planeSDF(vec3 p, vec3 normal, float distance) {
    // Calculate the signed distance from the point 'p' to the plane defined by 'normal' and 'distance'.
    return dot(p, normal) + distance;
}

SceneSample combine(SceneSample a, SceneSample b) {
    if (b.closest_distance < a.closest_distance) {
        return b;
    } else {
        return a;
    }
}



SceneSample scene(vec3 p) {
    vec3 v1 = rotate(p, sin(u.time), 0.0, 0.0);
    SceneSample a = SceneSample(planeSDF(v1, vec3(0.0, 1.0, 0.0), 0.5), 1);
    vec3 v2 = rotate(p, cos(u.time), 0.0, 0.0);
    SceneSample b = SceneSample(planeSDF(v2, vec3(0.0, 1.0, 0.0), 0.5), 2);
    vec3 v3 = rotate(p, cos(u.time), 0.0, 0.0);
    SceneSample c = SceneSample(planeSDF(v3, vec3(0.0, -1.0, 0.0), 0.5), 3);
    vec3 v4 = rotate(p, sin(u.time), 0.0, 0.0);
    SceneSample d = SceneSample(planeSDF(v4, vec3(0.0, -1.0, 0.0), 0.5), 4);
    vec3 v5 = rotate(p, cos(u.time), 0.0, 0.0);
    SceneSample e = SceneSample(planeSDF(v5, vec3(1.0, 0.0, 0.0), 0.5), 5);
    vec3 v7 = rotate(p, sin(u.time), 0.0, 0.0);
    SceneSample f = SceneSample(planeSDF(v7, vec3(1.0, 0.0, 0.0), 0.5), 6);
    vec3 v8 = rotate(p, sin(u.time), 0.0, 0.0);
    SceneSample g = SceneSample(planeSDF(v8, vec3(-1.0, 0.0, 0.0), 0.5), 7);
    vec3 v9 = rotate(p, cos(u.time), 0.0, 0.0);
    SceneSample h = SceneSample(planeSDF(v9, vec3(-1.0, 0.0, 0.0), 0.5), 8);
    return combine(combine(combine(combine(combine(combine(combine(a, b), c), d), e), f), g), h);
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
        return vec4(1.0, 1.0, 1.0, 1.0);
    }
    if (index == 2) {
        return vec4(1.0, 0.0, 1.0, 1.0);
    }
    if (index == 3) {
        return vec4(1.0, 1.0, 0.0, 1.0);
    }
    if (index == 4) {
        return vec4(0.0, 1.0, 1.0, 1.0);
    }
    return vec4(0);
}
float hash(vec4 p)  // replace this by something better
{
    p  = 50.0*fract( p*0.3183099 + vec4(0.71,0.113,0.419, 0.453));
    return -1.0+2.0*fract( p.x*p.y*p.z*p.w*(p.x+p.y+p.z) );
}
float noised(vec4 p, float g) {

    float angle = (p.y* 0.1);
    float c = cos(angle);
    float s = sin(angle);
    mat4 rot = mat4(-1, 0, 0, 0, 0, -1, 0, 0, 0, 0, c, -s, 0, 0, s, -c);
    vec4 rotated_p = p * rot;
    
    const vec2 e = vec2(0.0, 1.0);
    vec4 i = floor(rotated_p);    // integer
    vec4 f = fract(rotated_p);    // fract
    
    f = f*f*(3. - 2.*f*f);
    
    return mix(mix(mix(mix(hash(i + e.xxxx),
                           hash(i + e.yxxx), f.x),
                       mix(hash(i + e.xyxx),
                           hash(i + e.yyxx), f.x), f.y),
                   mix(mix(hash(i + e.xxyx),
                           hash(i + e.yxyx), f.x),
                       mix(hash(i + e.xyyx),
                           hash(i + e.yyyx), f.x), f.y), f.z),
               mix(mix(mix(hash(i + e.xxxy),
                           hash(i + e.yxxy), f.x),
                       mix(hash(i + e.xyxy),
                           hash(i + e.yyxy), f.x), f.y),
                   mix(mix(hash(i + e.xxyy),
                           hash(i + e.yxyy), f.x),
                       mix(hash(i + e.xyyy),
                           hash(i + e.yyyy), f.x), f.y), f.z), f.w);
}

float fbm(vec4 sample_point, float h) {
    float t = 0.0;
    for( int i=0; i<12; i++ ) {
        float f = pow( 2.0, float(i) );
        float a = pow( f, -h );
        t += a*noised(f*sample_point, float(i));
    }
    return t;
}
vec4 resolve_color_noise(int index, vec3 p) {
    if (index > 0) {
        return vec4(1.0, 0.0, 0.0, 1.0) *smoothstep(0.0, 1.0, fbm(vec4(p + vec3(0.0, 0.0, (u.time)), u.time), 0.9)) + 
               vec4(0.0, 0.0, 1.0, 1.0) *smoothstep(0.0, 1.0, fbm(vec4(p + vec3(0.0, 0.0, (u.time + 0.001)), u.time + 0.04), 0.9)) + 
               vec4(0.0, 1.0, 0.0, 1.0) *smoothstep(0.0, 1.0, fbm(vec4(p + vec3(0.0, 0.0, (u.time + 0.002)), u.time + 0.08), 0.9));
    }
    return vec4(0);
}

vec4 render(vec3 eye, vec3 ray) {
    RayEnd end = follow_ray(eye, ray, 100, 100.0);
    if (end.s.index == -1) {
        return vec4(0.0);
    }
    vec4 color = resolve_color_noise(end.s.index, end.current_position);
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
