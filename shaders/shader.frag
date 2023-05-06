#version 450 
layout (location = 0) out vec4 out_color;
  
layout (location = 0) in vec2 uv; // the input variable from the vertex shader (same name and same type)  


#define PI 3.1415926538
#define TAU 6.2831853071
#define FOV 100


float sphere(vec3 p, vec3 center, float radius) {
    return length(center - p) - radius;
}

float scene(vec3 p) {
    return sphere(p, vec3(0.0, 0.0, 12.0), 2.0);
}

float fov_factor() {
    return tan(FOV / 2 * PI / 180);
}

int follow_ray(vec3 start, vec3 direction, int steps) {
    int hit = -1;
    for (int i = 0; i < 100; ++i) {
        float d = scene(start);
        if (d < 0.0001) {
            out_color = vec4(uv, 0.0, 1.0);
            break;
        }
        start += direction;
        out_color = vec4(0.0);
    }

    return hit;
}

void main(){
    float fov = fov_factor();
    vec3 pixel_position = vec3((uv.x - 0.5) / 1.200 * fov, (uv.y - 0.5) / 1.920 * fov, 0.0);
    vec3 eye_position = vec3(0.0, 0.0, -1.0);
    vec3 ray_direction = normalize(pixel_position - eye_position); 

    for (int i = 0; i < 100; ++i) {
        float d = scene(eye_position);
        if (d < 0.0001) {
            out_color = vec4(uv, 0.0, 1.0);
            break;
        }
        eye_position += ray_direction;
        out_color = vec4(0.0);
    }
} 